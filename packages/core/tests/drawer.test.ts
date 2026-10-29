// tutor.ts, terminal.ts, agents.ts and tutor-api.ts: the drawer's WebSocket, through serve()'s `upgrade`, on a
// throwaway app served in process. A plain shell stands in for Claude Code (<PREFIX>_CLAUDE_CMD), and a scripted
// stand-in for an OpenAI-compatible API (it answers each request with the next reply queued by the test, streamed the
// way APIs stream them) for the API agent, which reaches the app's tools through its MCP server in process. From
// Galen's tests/mcp.test.ts (the terminal) and tests/tutor.test.ts (the API agent), the mechanism without the domain.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type net from 'node:net';
import path from 'node:path';
import WebSocket from 'ws';
import type { TutorEntry, TutorMessage } from '../src/shared/agents.ts';
import { agentCommand, createAgents } from '../src/server/agents.ts';
import type { App } from '../src/server/app.ts';
import { type Serving, serve } from '../src/server/http.ts';
import { defineTools, json as toolJson, type McpOptions, READ_ONLY, z } from '../src/server/mcp.ts';
import { createMethod } from '../src/server/method.ts';
import { createSettings, type Settings } from '../src/server/settings.ts';
import { Tutor } from '../src/server/tutor.ts';
import { Warnings } from '../src/server/warnings.ts';
import { fixtureApp } from './fixture-app.ts';

let app: App;
let settings: Settings;
let tutor: Tutor;
let serving: Serving;
let base = '';
let api: http.Server;
let API = '';
const logged: string[] = [];

/** What the stand-in API received, newest last. */
const received: { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[]; model: string }[] = [];
/** The replies it will give, in order. */
const replies: { text?: string; calls?: { name: string; args: unknown }[]; status?: number }[] = [];

before(async () => {
  app = await fixtureApp({ PROBE_CLAUDE_CMD: 'bash --norc --noprofile', PROBE_TERMINAL_QUIET_MS: '200' });
  await mkdir(path.join(app.root, '.claude/skills/note'), { recursive: true });
  await writeFile(
    path.join(app.root, '.claude/skills/note/SKILL.md'),
    '---\nname: note\ndescription: Keep a note.\n---\n# Note skill\n\nCall add_note.',
  );
  await writeFile(path.join(app.root, 'AGENTS.md'), '# Probe\n\n## Keeping notes\n\nNever invent a note.\n\n## Other\n\nNot this.');
  api = http.createServer(fakeApi);
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  API = `http://127.0.0.1:${(api.address() as net.AddressInfo).port}/v1`;

  const warnings = new Warnings();
  settings = createSettings({ file: app.settingsFile, warnings });
  const method = createMethod({
    root: app.root,
    section: 'Keeping notes',
    otherAgents: 'Written for Claude Code.',
    tool: { title: 'Read the routines', description: 'How to work here.', name: 'note' },
  });
  const tools = defineTools((mcp) => {
    mcp.registerTool('add_note', { description: 'Adds a note.', inputSchema: { text: z.string() } }, async ({ text }) => {
      logged.push(text);
      return toolJson({ notes: logged });
    });
    mcp.registerTool('get_notes', { annotations: READ_ONLY, description: 'The notes.' }, async () => toolJson(logged));
  });
  const mcp: McpOptions = {
    instructions: () => 'The probe: notes.',
    tools,
    extend: (server, { client }) => method.register(server, { inProcess: client === app.name }),
  };
  tutor = new Tutor({
    app,
    settings,
    api: {
      method,
      mcp,
      intro: 'You are the agent in Probe.',
      here: 'Replies are short.',
      dropped: '(Earlier parts were dropped: get_notes says where things stand.)',
      summarize: (tool, args) => (tool === 'add_note' ? `«${String(args.text)}»` : undefined),
    },
  });
  serving = await serve(app, { signals: false, upgrade: tutor.upgrade, stop: async () => tutor.stop() });
  base = `http://localhost:${serving.port}`;
});

after(async () => {
  await serving.close();
  api.close();
});

// The stand-in API: /chat/completions answered with the next queued reply, streamed in small pieces.
function fakeApi(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push(JSON.parse(body));
    const reply = replies.shift() ?? { text: 'Nothing more to say.' };
    if (reply.status) {
      res.writeHead(reply.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'stand-in refusal' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    chunk({ role: 'assistant', content: '' });
    for (const piece of (reply.text ?? '').match(/.{1,7}/gs) ?? []) chunk({ content: piece });
    for (const [index, call] of (reply.calls ?? []).entries()) {
      chunk({
        tool_calls: [{ index, id: `call_${received.length}_${index}`, type: 'function', function: { name: call.name, arguments: '' } }],
      });
      for (const piece of JSON.stringify(call.args).match(/.{1,11}/gs) ?? [])
        chunk({ tool_calls: [{ index, function: { arguments: piece } }] });
    }
    chunk({}, reply.calls?.length ? 'tool_calls' : 'stop');
    res.end('data: [DONE]\n\n');
  });
}

function openDrawer(origin: string | undefined = base): Promise<{ ws: WebSocket; messages: TutorMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serving.port}/api/terminal`, origin ? { origin } : {});
    const messages: TutorMessage[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(String(raw)) as TutorMessage));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

const output = (messages: TutorMessage[]) =>
  messages
    .filter((m) => m.type === 'output')
    .map((m) => (m as { data: string }).data)
    .join('');

/** The drawer's conversation as it stands, from the messages it was sent. */
function entriesOf(messages: TutorMessage[]): TutorEntry[] {
  let entries: TutorEntry[] = [];
  for (const m of messages) {
    if (m.type === 'transcript') entries = [...m.entries];
    else if (m.type === 'entry') {
      const at = entries.findIndex((e) => e.id === m.entry.id);
      if (at === -1) entries.push(m.entry);
      else entries[at] = m.entry;
    } else if (m.type === 'delta') {
      const e = entries.find((x) => x.id === m.id);
      if (e) e.text += m.text;
    }
  }
  return entries;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean | Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Timed out');
    await sleep(30);
  }
}

test('The drawer opens only to the app’s own pages, and a malformed frame closes only its socket', async () => {
  await assert.rejects(openDrawer(''), /403/, 'no Origin');
  await assert.rejects(openDrawer('https://example.com'), /403/, 'another site');
  await assert.rejects(openDrawer('http://localhost:5183'), /403/, 'another dev server on this machine');
  const bad = await openDrawer();
  const closed = new Promise((r) => bad.ws.on('close', r));
  (bad.ws as unknown as { _socket: net.Socket })._socket.write(Buffer.from([0x81, 0x83, 1, 2, 3, 4, 0xfe, 0xfc, 0xfe]));
  await closed;
  const still = await openDrawer();
  still.ws.close();
});

test('The terminal runs the agent in the app’s folder, takes messages, replays its screen to a late drawer', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'state'));
  const state = messages[0] as Extract<TutorMessage, { type: 'state' }>;
  assert.deepEqual([state.mode, state.engine, state.running, state.name], ['terminal', 'claude-code', false, 'Claude']);
  // The dev instance never starts an agent on its own (it would write through the live app's MCP server).
  ws.send(JSON.stringify({ type: 'start', auto: true }));
  await sleep(300);
  assert.ok(!messages.some((m) => m.type === 'state' && m.running));

  ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 30 }));
  ws.send(JSON.stringify({ type: 'start' }));
  await until(() => messages.some((m) => m.type === 'state' && m.running));
  ws.send(JSON.stringify({ type: 'send', text: 'echo probe-$((40+2)) $COLUMNS $PROBE_DRAWER $PWD' }));
  await until(() => output(messages).includes(`probe-42 120 1 ${app.root}`));

  const late = await openDrawer();
  await until(() => late.messages.some((m) => m.type === 'output' && m.replay && /probe-42/.test(m.data)));
  late.ws.close();

  ws.send(JSON.stringify({ type: 'stop' }));
  await until(() => messages.some((m) => m.type === 'exit'));
  ws.close();
});

test('run starts the agent with the request as its first message, or types it in when it is running', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'state'));
  // Not running: the request becomes an argument. Bash takes it as a script path, which shows it arrived intact.
  ws.send(JSON.stringify({ type: 'run', text: '/note x', initial: 'Use the note skill to file this: x' }));
  await until(() => /bash: Use the note skill to file this: x: /.test(output(messages)));
  await until(() => messages.some((m) => m.type === 'exit'));
  ws.send(JSON.stringify({ type: 'start' }));
  await until(() => messages.filter((m) => m.type === 'state' && m.running).length >= 2);
  ws.send(JSON.stringify({ type: 'run', text: 'echo typed-$((6*7))' }));
  await until(() => /typed-42/.test(output(messages)));
  ws.send(JSON.stringify({ type: 'stop' }));
  await until(() => messages.filter((m) => m.type === 'exit').length >= 2);
  ws.close();
});

test('The agent presets: the app’s MCP server by name for Codex, the test’s command before the preset', () => {
  const agents = createAgents({ app, settings });
  const codex = agents.launch('codex');
  assert.equal(codex.file, 'bash');
  const args = codex.args({ resume: true, prompt: 'hi' });
  assert.deepEqual(args.slice(0, 2), ['--norc', '--noprofile']);
  assert.ok(args.includes('mcp_servers.probe.command="node"'));
  assert.ok(args.includes(`mcp_servers.probe.args=[${JSON.stringify(path.join(app.root, 'server', 'bridge.ts'))}]`));
  assert.deepEqual(args.slice(-3), ['resume', '--last', 'hi']);
  assert.equal(agentCommand('gemini'), 'gemini');
  assert.equal(agents.current().id, 'claude-code');
});

test('The API agent: the app’s tools in process, the method, its words, and a line per tool in the drawer', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'state'));
  await settings.update({ tutor: 'api', api: { provider: 'custom', baseUrl: API, apiKey: 'sk-test-0123456789', model: 'fake/agent' } });
  await until(() => messages.some((m) => m.type === 'state' && m.mode === 'api'));
  const state = messages.findLast((m) => m.type === 'state') as Extract<TutorMessage, { type: 'state' }>;
  assert.deepEqual([state.name, state.running, state.command], ['Probe', true, 'fake/agent']);

  replies.push(
    { calls: [{ name: 'method', args: { name: 'note' } }] },
    { calls: [{ name: 'add_note', args: { text: 'buy rope' } }] },
    { text: '<think>done</think>Noted.' },
  );
  ws.send(JSON.stringify({ type: 'send', text: '/note buy rope' }));
  await until(() => entriesOf(messages).some((e) => e.kind === 'text' && e.text === 'Noted.'));
  await until(() => (messages.filter((m) => m.type === 'activity').at(-1) as { busy: boolean } | undefined)?.busy === false);

  const first = received.at(-3)!;
  const system = String(first.messages[0]?.content);
  assert.match(
    system,
    /^You are the agent in Probe\.\n\nThe probe: notes\.\n\n## Keeping notes\n\nNever invent a note\.\n\nReplies are short\./,
  );
  assert.match(system, /- note: Keep a note\./);
  assert.match(system, new RegExp(`Probe is at ${app.url}\\.`));
  assert.equal(first.messages.at(-1)?.content, 'Use the note skill: buy rope', 'a slash command typed there is put in words');
  const names = first.tools!.map((t) => t.function.name);
  for (const name of ['add_note', 'get_notes', 'method', 'web_search', 'read_page']) assert.ok(names.includes(name), name);
  // In process, `method` hands the routine without the rules, which it has already.
  const routine = received.at(-2)!.messages.find((m) => m.role === 'tool');
  assert.match(String(routine?.content), /# note\n\n# Note skill/);
  assert.doesNotMatch(String(routine?.content), /## Keeping notes/);
  assert.deepEqual(logged, ['buy rope']);

  const entries = entriesOf(messages);
  assert.deepEqual(
    entries.map((e) => (e.kind === 'tool' ? `${e.tool}:${e.state}` : e.kind)),
    ['user', 'method:done', 'add_note:done', 'text'],
  );
  assert.equal(entries.find((e) => e.tool === 'add_note')?.text, '«buy rope»', 'the app’s summary of its tool');
  assert.equal(entries.find((e) => e.tool === 'method')?.text, 'note', 'the core’s: the first string argument');

  // An API error is shown; clear starts over and is saved in the state folder.
  replies.push({ status: 401 });
  ws.send(JSON.stringify({ type: 'send', text: 'again' }));
  await until(() => entriesOf(messages).some((e) => e.kind === 'error'));
  ws.send(JSON.stringify({ type: 'clear' }));
  await until(async () => {
    try {
      return JSON.parse(await readFile(path.join(app.stateDir, 'tutor-api.json'), 'utf8')).messages.length === 0;
    } catch {
      return false;
    }
  });

  // Back to an agent: every drawer is told.
  await settings.update({ tutor: 'claude-code' });
  await until(() => messages.at(-2)?.type === 'state' && (messages.at(-2) as { mode: string }).mode === 'terminal');
  ws.close();
});
