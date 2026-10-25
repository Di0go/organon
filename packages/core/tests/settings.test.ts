// settings.ts against the files the apps really have: Aristotle's ({"accent"}, written by hand, mode 644) and Galen's
// ({"health": {"token"}}, Galen's own extension), plus what the interface sends. Each test on a throwaway folder.
//
//   pnpm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSettings, SettingsError } from '../src/server/settings.ts';
import { Warnings } from '../src/server/warnings.ts';

async function folder(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'organon-settings-'));
}

async function onDisk(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}

test("Aristotle's file: the accent is read, and kept through a change made in Settings", async () => {
  const file = path.join(await folder(), 'settings.json');
  await writeFile(file, '{ "accent": "red" }\n', { mode: 0o644 });
  const settings = createSettings({ file, warnings: new Warnings() });
  assert.equal(settings.accent, 'red');
  assert.equal(settings.tutor, 'claude-code');
  await settings.update({ tutor: 'codex' });
  assert.deepEqual(await onDisk(file), { accent: 'red', tutor: 'codex' });
  // It can hold an API key from now on: readable by this user only, whatever it was before.
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("Galen's file: an app's own key is read, kept through the core's changes, and changed through extra", async () => {
  const file = path.join(await folder(), 'settings.json');
  await writeFile(file, '{ "health": { "token": "abcd-efgh-jkmn-pqrs-tuvw" } }\n', { mode: 0o600 });
  const settings = createSettings({ file, warnings: new Warnings() });
  assert.deepEqual(settings.extra('health'), { token: 'abcd-efgh-jkmn-pqrs-tuvw' });
  await settings.update({ helpers: 'api', api: { provider: 'ollama', model: 'qwen3' } });
  assert.deepEqual((await onDisk(file)).health, { token: 'abcd-efgh-jkmn-pqrs-tuvw' });
  let changes = 0;
  settings.events.on('change', () => changes++);
  await settings.setExtra('health', undefined);
  assert.equal('health' in (await onDisk(file)), false);
  assert.equal(changes, 1);
});

test("The core's own keys can't be written through extra", async () => {
  const settings = createSettings({ file: path.join(await folder(), 'settings.json'), warnings: new Warnings() });
  await assert.rejects(settings.setExtra('api', { apiKey: 'sk-sneaky' }), SettingsError);
});

test('An unknown accent is no accent: the app falls back on its own default', async () => {
  const file = path.join(await folder(), 'settings.json');
  await writeFile(file, '{ "accent": "teal" }');
  assert.equal(createSettings({ file, warnings: new Warnings() }).accent, undefined);
});

test('A settings.json that does not parse is set aside and said, never overwritten by the next change', async () => {
  const dir = await folder();
  const file = path.join(dir, 'settings.json');
  const broken = '{\n  "agentCommand": "my-claude --flag",\n  "health": { "token": "abcd-efgh-jkmn-pqrs-tuvw" },\n}\n';
  await writeFile(file, broken);
  const warnings = new Warnings();
  const settings = createSettings({ file, warnings });
  assert.equal(settings.agentCommand, undefined);
  assert.match(warnings.list().join('\n'), /settings\.json could not be read and was set aside/);
  await settings.update({ tutor: 'codex' });
  const aside = (await readdir(dir)).find((f) => f.startsWith('settings.json.unreadable-'));
  assert.ok(aside, 'the unreadable file is kept beside the new one');
  assert.equal(await readFile(path.join(dir, aside), 'utf8'), broken);
});

test('What the interface sends is checked field by field; nothing is written when one is wrong', async () => {
  const file = path.join(await folder(), 'settings.json');
  const settings = createSettings({ file, warnings: new Warnings() });
  await assert.rejects(settings.update({ tutor: 'clippy' as never }), /Unknown tutor/);
  await assert.rejects(settings.update({ api: { baseUrl: 'https://user:pw@example.com/v1' } }), /not in the address/);
  await assert.rejects(settings.update({ api: { apiKey: 'sk has spaces' } }), /no spaces/);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});

test("The key from the app's environment is used, and the interface only ever sees it masked", async () => {
  const settings = createSettings({
    file: path.join(await folder(), 'settings.json'),
    warnings: new Warnings(),
    apiKey: 'sk-or-v1-0123456789abcdef',
  });
  await settings.update({ api: { provider: 'openrouter', model: 'some/model' } });
  assert.equal(settings.endpoint().apiKey, 'sk-or-v1-0123456789abcdef');
  const view = settings.view(() => false);
  assert.equal(view.api.key, 'sk-or…cdef');
  assert.equal(view.api.keyFromEnv, true);
  assert.equal(JSON.stringify(view).includes('0123456789'), false);
});
