// The app's server on the core's settings and store, through its HTTP API.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { put, type Running, start } from './helpers.ts';

const running: Running[] = [];
after(() => {
  for (const r of running) void r.stop();
});

test('Settings: the core changes who runs the agent, the app its own motto, one file readable only by this user', async () => {
  const app = await start();
  running.push(app);
  const changed = await put(app.base, { tutor: 'opencode', motto: 'Know thyself' });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.tutor, 'opencode');
  assert.equal(changed.json.motto, 'Know thyself');
  const file = path.join(app.stateDir, 'settings.json');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { tutor: 'opencode', motto: 'Know thyself' });
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('A request with one bad field changes nothing, the core field or the app field', async () => {
  const app = await start();
  running.push(app);
  assert.equal((await put(app.base, { tutor: 'clippy', motto: 'never written' })).status, 400);
  assert.equal((await put(app.base, { tutor: 'codex', motto: 42 })).status, 400);
  const view = (await (await fetch(`${app.base}/api/settings`)).json()) as Record<string, unknown>;
  assert.equal(view.tutor, 'claude-code');
  assert.equal(view.motto, '');
});

test("A broken settings.json is set aside, said in the app's warnings, and the app starts on the defaults", async () => {
  const state = await mkdtemp(path.join(tmpdir(), 'minimal-state-'));
  await writeFile(path.join(state, 'settings.json'), '{ "motto": "kept", }');
  const app = await start(state);
  running.push(app);
  const stateNow = (await (await fetch(`${app.base}/api/state`)).json()) as { warnings: string[] };
  assert.match(stateNow.warnings.join('\n'), /settings\.json could not be read and was set aside/);
  assert.ok((await readdir(state)).some((f) => f.startsWith('settings.json.unreadable-')));
});

test("The app's own record goes through the core's store: a note is written whole into data/", async () => {
  const app = await start();
  running.push(app);
  const res = await fetch(`${app.base}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"text":"First"}',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(await readFile(path.join(app.dataDir, 'notes.json'), 'utf8')), { notes: ['First'] });
});

test("A record that is there but can't be read is said, and a write to it is refused, so what it holds is kept", async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'minimal-data-'));
  const notes = path.join(data, 'notes.json');
  await writeFile(notes, '{"notes":["kept"]}');
  await chmod(notes, 0o000);
  const app = await start(undefined, data);
  running.push(app);
  const state = (await (await fetch(`${app.base}/api/state`)).json()) as { warnings: string[] };
  assert.match(state.warnings.join('\n'), /could not be read: notes\.json/);
  const res = await fetch(`${app.base}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"text":"new"}',
  });
  assert.equal(res.status, 500);
  await chmod(notes, 0o600);
  assert.equal(await readFile(notes, 'utf8'), '{"notes":["kept"]}');
});

test("The app's own tool, through the core's MCP endpoint: get_notes reads what the store wrote", async () => {
  const app = await start();
  running.push(app);
  await fetch(`${app.base}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"Seen"}' });
  const res = await fetch(`${app.base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_notes', arguments: {} } }),
  });
  const line = (await res.text()).split('\n').find((l) => l.startsWith('data:')) ?? '';
  const result = JSON.parse(line.slice(5)) as { result: { content: { text: string }[] } };
  assert.deepEqual(JSON.parse(result.result.content[0]?.text ?? ''), { motto: '', notes: ['Seen'] });
});

test("The core's checks stand in front of the app's routes: another site's request is refused", async () => {
  const app = await start();
  running.push(app);
  const res = await fetch(`${app.base}/api/settings`, { headers: { Origin: 'http://evil.example' } });
  assert.equal(res.status, 403);
});
