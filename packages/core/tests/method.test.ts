// method.ts and the per-client part of mcp.ts: the app's routines (its skills, helpers and the rules of its AGENTS.md
// section) handed to an agent that doesn't load skills itself, through the `method` tool and the prompts; the app
// says which clients get them (`extend`). A client over HTTP can't take the app's own name, which is the in-process
// agent's. And the bridge: a call the client cancels gets no answer, and the next one does.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { App } from '../src/server/app.ts';
import { runBridge } from '../src/server/bridge.ts';
import { type Serving, serve } from '../src/server/http.ts';
import { createMcpHandler, defineTools, json, text } from '../src/server/mcp.ts';
import { createMethod } from '../src/server/method.ts';
import { fixtureApp } from './fixture-app.ts';

let app: App;
let serving: Serving;
const seen: { client: string; inProcess: boolean }[] = [];
let method: ReturnType<typeof createMethod>;

before(async () => {
  app = await fixtureApp();
  await mkdir(path.join(app.root, '.claude/skills/journal'), { recursive: true });
  await mkdir(path.join(app.root, '.claude/agents'), { recursive: true });
  await writeFile(
    path.join(app.root, '.claude/skills/journal/SKILL.md'),
    '---\nname: journal\ndescription: Save the day.\n---\n\nLog the day with log_day.\n',
  );
  await writeFile(
    path.join(app.root, '.claude/agents/researcher.md'),
    '---\nname: researcher\ndescription: Checks facts.\n---\n\nTwo sources.\n',
  );
  await writeFile(
    path.join(app.root, 'AGENTS.md'),
    '# Probe\n\n## When keeping the record\n\n- Never invent a number.\n\n## Working on the app\n\n- Not this.\n',
  );
  method = createMethod({
    root: app.root,
    section: 'When keeping the record',
    otherAgents: 'This method was written for Claude Code.',
    prompts: ['journal'],
    tool: { title: 'Read the routines', description: 'How to work in Probe.', name: 'journal, or a helper' },
    prompt: { title: 'Probe', request: 'What was said', entry: 'The entry', empty: 'Start: nothing more was said.' },
  });
  const slow = defineTools((mcp) => {
    mcp.registerTool('slow', { description: 'Answers after a second' }, async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return text('late');
    });
    mcp.registerTool('quick', { description: 'Answers at once' }, async () => json(1));
  });
  serving = await serve(app, {
    signals: false,
    mcp: createMcpHandler(app, {
      instructions: () => 'Probe.',
      tools: slow,
      // Claude Code has the skills itself; every other client is handed the method.
      extend: (mcp, { client }) => {
        seen.push({ client, inProcess: client === app.name });
        if (client !== 'claude-code') method.register(mcp, { inProcess: client === app.name });
      },
    }),
  });
});
after(() => serving.close());

test('The routines: skills then helpers, each with its description and body; the rules from the AGENTS.md section', () => {
  assert.deepEqual(
    method.skills().map((s) => [s.name, s.kind, s.description]),
    [
      ['journal', 'skill', 'Save the day.'],
      ['researcher', 'helper', 'Checks facts.'],
    ],
  );
  assert.equal(method.skill('/Journal')?.body, 'Log the day with log_day.');
  assert.equal(method.essentials(), '## When keeping the record\n\n- Never invent a number.');
});

async function connect(agent?: string) {
  const client = new Client({ name: 'test', version: '1' });
  const headers: Record<string, string> = agent ? { 'X-Organon-Agent': agent } : {};
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${serving.port}/mcp`), { requestInit: { headers } }));
  return client;
}

test('Another agent gets `method` and the prompts, with the rules; Claude Code gets neither', async () => {
  const other = await connect('codex-mcp-client');
  const tools = (await other.listTools()).tools.map((t) => t.name);
  assert.deepEqual(tools.sort(), ['method', 'quick', 'slow']);
  const list = (await other.callTool({ name: 'method', arguments: {} })) as { content: { text: string }[] };
  assert.match(list.content[0]?.text ?? '', /- journal \(skill\): Save the day\.\n- researcher \(helper\): Checks facts\./);
  const handed = (await other.callTool({ name: 'method', arguments: { name: 'journal' } })) as { content: { text: string }[] };
  assert.equal(
    handed.content[0]?.text,
    'This method was written for Claude Code.\n\n## When keeping the record\n\n- Never invent a number.\n\n# journal\n\nLog the day with log_day.',
  );
  const prompts = (await other.listPrompts()).prompts.map((p) => [p.name, p.title, p.description]);
  assert.deepEqual(prompts, [['journal', 'Probe: journal', 'Save the day.']]);
  const prompt = await other.getPrompt({ name: 'journal', arguments: { request: ' slept 7h ' } });
  assert.match(
    (prompt.messages[0]?.content as { text?: string } | undefined)?.text ?? '',
    /# journal\n\nLog the day with log_day\.\n\n---\n\nThe entry: slept 7h$/,
  );
  await other.close();
  const claude = await connect('claude-code');
  assert.deepEqual((await claude.listTools()).tools.map((t) => t.name).sort(), ['quick', 'slow']);
  await claude.close();
});

test("A client over HTTP can't take the app's own name: that is the in-process agent's", async () => {
  seen.length = 0;
  const impostor = await connect('probe');
  await impostor.listTools();
  await impostor.close();
  assert.ok(seen.length > 0 && seen.every((s) => s.client === '' && !s.inProcess), JSON.stringify(seen));
});

test('Through the bridge, a call the client cancels gets no answer, and the next call does', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const answers: { id?: number; result?: unknown; error?: unknown }[] = [];
  let buffer = '';
  output.on('data', (d: Buffer) => {
    buffer += d.toString();
    for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
      answers.push(JSON.parse(buffer.slice(0, nl)));
      buffer = buffer.slice(nl + 1);
    }
  });
  const done = runBridge(app, { input, output });
  const send = (m: unknown) => input.write(`${JSON.stringify(m)}\n`);
  const wait = async (ms: number) => new Promise((r) => setTimeout(r, ms));
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
  });
  for (let i = 0; i < 100 && !answers.some((a) => a.id === 1); i++) await wait(30);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'slow', arguments: {} } });
  await wait(200);
  send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2 } });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'quick', arguments: {} } });
  await wait(1500);
  assert.equal(answers.filter((a) => a.id === 2).length, 0, 'no answer, and no "lost" error, for the cancelled call');
  assert.ok(
    answers.some((a) => a.id === 3 && a.result),
    'the next call answers',
  );
  input.end();
  await done;
});
