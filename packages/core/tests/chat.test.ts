// chat.ts and oneshot.ts: the chat beside a page, on a throwaway app served in process, with `cat` in Claude Code's
// place (<PREFIX>_ONESHOT_CMD), so the answer is the request it was sent: what the model would be told, word for word.
// The log is appended to, read on top of a chat kept the old way, and holds across a restart; the live feed carries
// every change. From Galen's tests/mcp.test.ts and tests/tutor.test.ts.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatEvent, ChatMessage } from '../src/shared/chat.ts';
import type { App } from '../src/server/app.ts';
import { chatRoutes, Chats } from '../src/server/chat.ts';
import { type Serving, serve } from '../src/server/http.ts';
import { createOneshot } from '../src/server/oneshot.ts';
import { createSettings } from '../src/server/settings.ts';
import { createStore } from '../src/server/store.ts';
import { Warnings } from '../src/server/warnings.ts';
import { fixtureApp } from './fixture-app.ts';

let app: App;
let chats: Chats;
let serving: Serving;
let base = '';
const events: ChatEvent[] = [];
const contexts: string[] = [];

async function load(): Promise<Chats> {
  const warnings = new Warnings();
  const settings = createSettings({ file: app.settingsFile, warnings });
  const oneshot = createOneshot({ app, settings });
  return Chats.load({
    app,
    store: createStore({ dataDir: app.dataDir, warnings }),
    oneshot,
    system: 'You are Probe.',
    tools: { writes: 'You can change the notes.', talkOnly: 'You only talk.', remove: ['remove_note'] },
    person: { message: 'Their words', label: 'Them' },
  });
}

async function start() {
  chats = await load();
  chats.onEvent((e) => events.push(e));
  serving = await serve(app, {
    signals: false,
    api: chatRoutes(chats, {
      context: (thread, body) => {
        const said = `Where: ${body.where ?? thread}${body.page ? `\nPage: ${body.page}` : ''}${body.tags.length ? `\nTags: ${body.tags}` : ''}`;
        contexts.push(said);
        return said;
      },
    }),
  });
  base = `http://localhost:${serving.port}`;
}

before(async () => {
  app = await fixtureApp({ PROBE_ONESHOT_CMD: 'cat' });
  await start();
});

after(() => serving.close());

async function restart() {
  await chats.idle();
  await serving.close();
  await start();
}

const say = (thread: string, body: Record<string, unknown>) =>
  fetch(`${base}/api/chats/${encodeURIComponent(thread)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = async (thread: string) => (await (await fetch(`${base}/api/chats/${encodeURIComponent(thread)}`)).json()) as ChatMessage[];

test('A message is answered with the page’s context and the person’s words; the feed carries both, and the tags', async () => {
  const res = await say('Today', { text: 'why @2026-10-18?', where: 'Home', page: 'Readiness 80', tags: ['@2026-10-18', 3] });
  assert.equal(res.status, 200);
  const answer = (await res.json()) as ChatMessage;
  // `cat` answers with what it was sent: the context, then the message in the app's words.
  assert.equal(answer.text, 'Where: Home\nPage: Readiness 80\nTags: @2026-10-18\n\nTheir words: why @2026-10-18?');
  assert.equal(answer.role, 'assistant');
  const messages = await get('today');
  assert.deepEqual(
    messages.map((m) => m.role),
    ['user', 'assistant'],
    'one conversation per place, by its slug',
  );
  assert.deepEqual(messages[0]?.mentions, ['@2026-10-18']);
  // A stand-in's plain output is no stream: the answer comes whole (the stream is the next test's).
  assert.deepEqual(
    events.map((e) => e.type),
    ['chat', 'chat'],
  );
  assert.deepEqual(events[0], { type: 'chat', thread: 'today', message: messages[0] });
});

test('A request with no text, or an empty one, is refused with what is wrong', async () => {
  assert.equal((await say('today', {})).status, 400);
  const empty = await say('today', { text: '  ' });
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: 'Write something first' });
});

test('A chat is an append-only log, read on top of a chat kept the old way, and starting over holds', async () => {
  const dir = path.join(app.dataDir, 'chats');
  await writeFile(
    path.join(dir, 'old-chat.json'),
    JSON.stringify({ thread: 'old-chat', messages: [{ id: 'a', role: 'user', text: 'Before', at: '2026-01-01T00:00:00.000Z' }] }),
  );
  await restart();
  assert.equal((await say('old-chat', { text: 'After' })).status, 200);
  await restart();
  assert.deepEqual(
    (await get('old-chat')).map((m) => m.text.slice(-5)),
    ['efore', 'After', 'After'],
  );
  const files = await readdir(dir);
  assert.ok(files.includes('old-chat.json') && files.includes('old-chat.jsonl'), 'the old file is never rewritten');
  assert.deepEqual(JSON.parse((await readFile(path.join(dir, 'old-chat.json'), 'utf8')).trim()).messages.length, 1);
  await fetch(`${base}/api/chats/old-chat`, { method: 'DELETE' });
  await restart();
  assert.deepEqual(await get('old-chat'), []);
  assert.deepEqual(await (await fetch(`${base}/api/chats/old-chat/answer`, { method: 'DELETE' })).json(), { stopped: false });
});

test('On Claude Code: locked down, the app’s tools by name without the removed ones, a session, a paragraph after a tool', async () => {
  // A stand-in for Claude Code's own command (never the real one): it keeps its arguments and stdin, and streams two
  // turns the way `--output-format stream-json` does, as if a tool had been called between them.
  const fake = path.join(app.root, 'fake-claude.mjs');
  const seen = path.join(app.root, 'fake-claude.json');
  await writeFile(
    fake,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: process.argv.slice(2), input, cwd: process.cwd() }));
  const ev = (event) => console.log(JSON.stringify({ type: 'stream_event', event }));
  const text = (t) => ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } });
  ev({ type: 'message_start' });
  text('Logged.');
  ev({ type: 'message_start' });
  text('Anything else?');
});
`,
    { mode: 0o755 },
  );
  const warnings = new Warnings();
  const settings = createSettings({ file: app.settingsFile, warnings });
  const cwd = path.join(app.stateDir, 'claude');
  const real = await Chats.load({
    app,
    store: createStore({ dataDir: app.dataDir, warnings }),
    oneshot: createOneshot({ app, settings, command: '', claude: fake, cwd, model: 'haiku' }),
    system: 'You are Probe.',
    tools: { writes: 'You can change the notes.', talkOnly: 'You only talk.', remove: ['remove_note', 'remove_all'] },
  });
  const deltas: string[] = [];
  real.onEvent((e) => e.type === 'chat-delta' && deltas.push(e.delta));
  const answer = await real.send('tools', 'slept 7 h', 'Where: Home');
  assert.equal(answer.text, 'Logged.\n\nAnything else?', 'the text after a tool call starts a paragraph');
  assert.deepEqual(deltas, ['Logged.', '\n\n', 'Anything else?']);

  const { args, input, cwd: ran } = JSON.parse(await readFile(seen, 'utf8')) as { args: string[]; input: string; cwd: string };
  assert.equal(ran, cwd, 'its own private folder, made on first use');
  assert.equal(input, 'Where: Home\n\nTheir message: slept 7 h', 'the default words for the person');
  assert.deepEqual(args.slice(0, 8), ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--setting-sources', '']);
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'You are Probe. You can change the notes.');
  assert.ok(args.includes('--session-id'));
  const config = JSON.parse(args.find((a) => a.startsWith('--mcp-config='))!.slice('--mcp-config='.length));
  assert.deepEqual(config, { mcpServers: { probe: { command: process.execPath, args: [path.join(app.root, 'server', 'bridge.ts')] } } });
  assert.ok(args.includes('--allowedTools=mcp__probe'));
  assert.ok(args.includes('--disallowedTools=mcp__probe__remove_note,mcp__probe__remove_all'));
  for (const a of ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']) assert.ok(args.includes(a), a);

  // The next message carries on the same session.
  const session = args[args.indexOf('--session-id') + 1];
  await real.send('tools', 'and ate well', 'Where: Home');
  const next = (JSON.parse(await readFile(seen, 'utf8')) as { args: string[] }).args;
  assert.equal(next[next.indexOf('--resume') + 1], session);
  await real.idle();
});
