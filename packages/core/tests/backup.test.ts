// backup.ts against a throwaway data repository: it commits what changed with the app's summary of it, pushes when
// there is a remote, and when that keeps failing the app's warnings say so. Off in the dev instance and with
// <PREFIX>_BACKUP=off. From Galen's tests/backup.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineApp } from '../src/server/app.ts';
import { Backup } from '../src/server/backup.ts';
import { Warnings } from '../src/server/warnings.ts';
import { fixtureApp } from './fixture-app.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('The backup commits what changed in the app’s words, pushes it, and says so in the warnings when it fails', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'organon-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = path.join(root, 'data');
  const remote = path.join(root, 'remote.git');
  await mkdir(path.join(data, 'days'), { recursive: true });
  git(root, 'init', '--quiet', '--bare', remote);
  git(data, 'init', '--quiet');
  git(data, 'config', 'user.email', 'test@example.com');
  git(data, 'config', 'user.name', 'Test');
  git(data, 'commit', '--quiet', '--allow-empty', '-m', 'start');
  git(data, 'remote', 'add', 'origin', remote);
  git(data, 'push', '--quiet', '-u', 'origin', 'HEAD');

  const probe = await fixtureApp();
  // The live instance: the dev one never backs up.
  const app = defineApp(probe.root, { PROBE_DATA_DIR: data, PROBE_STATE_DIR: path.join(root, 'state'), HOME: root });
  const warnings = new Warnings();
  const seen: string[][] = [];
  const backup = new Backup({
    app,
    warnings,
    describeChanges: (files) => {
      seen.push(files);
      const day = files.find((f) => f.startsWith('days/'));
      return day ? `day ${path.basename(day, '.json')}` : '';
    },
  });
  assert.equal(backup.enabled, true);

  await writeFile(path.join(data, 'days', '2026-10-18.json'), '{}');
  await writeFile(path.join(data, 'a b.md'), '# Me');
  backup.schedule(0);
  for (let i = 0; i < 100 && !backup.state().lastAt; i++) await sleep(50);
  assert.equal(git(data, 'log', '-1', '--format=%s'), 'Data: day 2026-10-18');
  assert.deepEqual(seen.at(-1), ['a b.md', 'days/2026-10-18.json'], 'every untracked file by name, unquoted');
  assert.equal(git(data, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'HEAD'), 'pushed');
  assert.deepEqual(warnings.list(), []);

  // Nothing the app names: a count of the files.
  await writeFile(path.join(data, 'notes.json'), '[]');
  backup.schedule(0);
  const before = backup.state().lastAt;
  for (let i = 0; i < 100 && backup.state().lastAt === before; i++) await sleep(50);
  assert.equal(git(data, 'log', '-1', '--format=%s'), 'Data: 1 file');

  // The remote goes away: the commit still happens, the push fails, and it is said.
  await rm(remote, { recursive: true, force: true });
  await writeFile(path.join(data, 'notes.json'), '[1]');
  backup.schedule(0);
  for (let i = 0; i < 100 && !backup.state().lastError; i++) await sleep(50);
  assert.ok(
    warnings.list().some((w) => /^Backup has failed since /.test(w)),
    warnings.list().join('; '),
  );
  assert.equal(git(data, 'log', '-1', '--format=%s'), 'Data: 1 file');

  // Off in the dev instance, and with <PREFIX>_BACKUP=off.
  assert.equal(new Backup({ app: defineApp(probe.root, { PROBE_DATA_DIR: data, PROBE_INSTANCE: 'dev' }), warnings }).enabled, false);
  assert.equal(new Backup({ app: defineApp(probe.root, { PROBE_DATA_DIR: data, PROBE_BACKUP: 'off' }), warnings }).enabled, false);
});
