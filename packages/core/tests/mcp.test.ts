// mcp.ts and bridge.ts: an app's tools over /mcp, reached the way Claude Code reaches them, through the stdio bridge.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { App } from '../src/server/app.ts';
import { runBridge } from '../src/server/bridge.ts';
import { type Serving, serve } from '../src/server/http.ts';
import { checkTools, createMcpHandler, defineTools, json, READ_ONLY, z } from '../src/server/mcp.ts';
import { fixtureApp } from './fixture-app.ts';

let app: App;
let serving: Serving;
let seenClient = '';
const tools = defineTools((mcp) => {
  mcp.registerTool(
    'get_things',
    { annotations: READ_ONLY, description: 'The things, or one by name', inputSchema: { name: z.string().optional() } },
    async ({ name }) => json(name ? [name] : ['a', 'b']),
  );
});

before(async () => {
  app = await fixtureApp();
  serving = await serve(app, {
    signals: false,
    mcp: createMcpHandler(app, {
      instructions: (client) => {
        seenClient = client;
        return 'Probe: things.';
      },
      tools,
      core: ['get_things'],
    }),
  });
});
after(() => serving.close());

test('checkTools says what a client would cut or miss', () => {
  assert.deepEqual(checkTools(tools), []);
  const bad = defineTools((mcp) => {
    mcp.registerTool('a', { description: 'x'.repeat(2049) }, async () => json(1));
    mcp.registerTool('a', { description: '' }, async () => json(1));
  });
  assert.deepEqual(checkTools(bad), ['a: description is 2049 characters, over 2048', 'a: defined twice', 'a: no description']);
});

test('Through the bridge: initialize, list the tools, call one, with the client’s name passed on', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const answers: Record<string, unknown>[] = [];
  let buffer = '';
  output.on('data', (d: Buffer) => {
    buffer += d.toString();
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      answers.push(JSON.parse(buffer.slice(0, nl)));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
  });
  const done = runBridge(app, { input, output });
  const send = (m: unknown) => input.write(`${JSON.stringify(m)}\n`);
  const answer = async (id: number) => {
    for (let i = 0; i < 100; i++) {
      const a = answers.find((m) => m.id === id);
      if (a) return a as { result?: Record<string, unknown>; error?: unknown };
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`No answer to ${id}`);
  };
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } },
  });
  const init = await answer(1);
  assert.equal((init.result?.serverInfo as { name?: string } | undefined)?.name, 'probe');
  assert.equal(init.result?.instructions, 'Probe: things.');
  assert.equal(seenClient, 'claude-code');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = (await answer(2)).result?.tools as { name: string; _meta?: unknown }[];
  assert.deepEqual(
    list.map((t) => t.name),
    ['get_things'],
  );
  // Not the app's drawer: the core tools are not forced to load.
  assert.equal(list[0]?._meta, undefined);
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_things', arguments: { name: 'c' } } });
  const call = (await answer(3)).result?.content as { text: string }[];
  assert.deepEqual(JSON.parse(call[0]?.text ?? ''), ['c']);
  input.end();
  await done;
});

test('A GET on /mcp is refused: the endpoint is POST only', async () => {
  assert.equal((await fetch(`http://127.0.0.1:${serving.port}/mcp`)).status, 405);
});
