// store.ts: a file that can't be read is set aside and said, never overwritten; writes are whole; an append that
// fails is kept and written with the next one. On throwaway folders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore, isObject, readLog, writeJson } from '../src/server/store.ts';
import { Warnings } from '../src/server/warnings.ts';

async function dataDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'organon-store-'));
}

test('A JSON file of the wrong shape is set aside under its own name and said, relative to data/', async () => {
  const data = await dataDir();
  await mkdir(path.join(data, 'days'));
  await writeFile(path.join(data, 'days', '2026-10-18.json'), '{"date":"2026-10-18"}');
  await writeFile(path.join(data, 'days', '2026-10-19.json'), '[1, 2');
  const warnings = new Warnings();
  const { loadJsonDir } = createStore({ dataDir: data, warnings });
  const days = await loadJsonDir(path.join(data, 'days'), isObject);
  assert.deepEqual(days, [{ date: '2026-10-18' }]);
  const names = await readdir(path.join(data, 'days'));
  assert.ok(names.some((n) => n.startsWith('2026-10-19.json.unreadable-')));
  assert.match(warnings.list()[0] ?? '', /set aside: days\/2026-10-19\.json\.unreadable-/);
  // Seen again on the next start, until someone deals with it.
  const again = new Warnings();
  await createStore({ dataDir: data, warnings: again }).loadJsonDir(path.join(data, 'days'), isObject);
  assert.equal(again.list().length, 1);
});

test('A missing file is the fallback, and is not a warning', async () => {
  const data = await dataDir();
  const warnings = new Warnings();
  const value = await createStore({ dataDir: data, warnings }).loadJson(path.join(data, 'gates.json'), isObject, { gates: [] });
  assert.deepEqual(value, { gates: [] });
  assert.deepEqual(warnings.list(), []);
});

test('writeJson writes the whole file, and leaves no temp file behind', async () => {
  const data = await dataDir();
  await writeJson(path.join(data, 'nested', 'targets.json'), { sleep: 8 });
  assert.equal(await readFile(path.join(data, 'nested', 'targets.json'), 'utf8'), '{\n  "sleep": 8\n}\n');
  assert.deepEqual(await readdir(path.join(data, 'nested')), ['targets.json']);
});

test('An append the disk refuses is kept, said, and written with the next one', async () => {
  const data = await dataDir();
  const dir = path.join(data, 'chats');
  await mkdir(dir);
  const file = path.join(dir, 'home.jsonl');
  const warnings = new Warnings();
  const { AppendLog } = createStore({ dataDir: data, warnings });
  const log = new AppendLog('The chat');
  await chmod(dir, 0o500);
  await assert.rejects(log.append(file, { n: 1 }));
  assert.match(warnings.list()[0] ?? '', /The chat could not be saved/);
  await chmod(dir, 0o700);
  await log.append(file, { n: 2 });
  assert.deepEqual(await readLog(file), [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(warnings.list(), []);
});
