// release.ts: a pin the release copy could not install is found before anything is built, stopped or restarted, in
// the lockfile of the commit that goes live. Found on Argus's first release: pnpm writes a file: pin relative to the
// lockfile, so a tarball in releases/ named by an absolute path in package.json is ../Organon/releases/… in the lockfile,
// which the copy in ~/.local/share/<app>/app does not have. And a release is live only when its commit answers.

import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type App, defineApp } from '../src/server/app.ts';
import { release, releaseAnswers, serviceScript, unreachablePins, unverifiedPins } from '../src/server/release.ts';
import { freePort } from '../src/testing.ts';

/** A throwaway folder, removed after the test. */
async function scratch(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'organon-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('A file: pin relative to the checkout is unreachable from the release copy; a URL pin is not a path', async (t) => {
  const home = await scratch(t);
  const root = path.join(home, 'Projects/Argus');
  await mkdir(path.join(home, 'Projects/Organon/releases'), { recursive: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(home, 'Projects/Organon/releases/organon-core-0.4.0.tgz'), 'x');
  const copy = path.join(home, '.local/share/argus/app');
  const lock = `
  '@organon/core@file:../Organon/releases/organon-core-0.4.0.tgz':
    resolution: {integrity: sha512-x, tarball: file:../Organon/releases/organon-core-0.4.0.tgz}
  'other@https://github.com/Di0go/organon/releases/download/v0.3.0/organon-core-0.3.0.tgz':
    resolution: {integrity: sha512-y, tarball: https://github.com/Di0go/organon/releases/download/v0.3.0/organon-core-0.3.0.tgz}
`;
  assert.deepEqual(unreachablePins(lock, root, copy), ['../Organon/releases/organon-core-0.4.0.tgz']);
  // From a copy beside the checkout the same relative path is there: nothing to say.
  assert.deepEqual(unreachablePins(lock, root, path.join(home, 'Projects/Argus-copy')), []);
  assert.deepEqual(unreachablePins('', root, copy), []);
});

test('A tarball pinned by URL with no integrity in the lockfile is found: a frozen install refuses it', () => {
  const lock = `
  '@organon/core@https://github.com/Di0go/organon/releases/download/v0.5.1/organon-core-0.5.1.tgz':
    resolution: {tarball: https://github.com/Di0go/organon/releases/download/v0.5.1/organon-core-0.5.1.tgz}
  'other@https://example.test/other-1.0.0.tgz':
    resolution: {integrity: sha512-y, tarball: https://example.test/other-1.0.0.tgz}
`;
  assert.deepEqual(unverifiedPins(lock), ['https://github.com/Di0go/organon/releases/download/v0.5.1/organon-core-0.5.1.tgz']);
  assert.deepEqual(unverifiedPins(''), []);
});

test("A rollback to a release from before the core installs the service with that release's own script", async (t) => {
  const dir = await scratch(t);
  // A release on the core: the core's script, from its own node_modules.
  await mkdir(path.join(dir, 'node_modules/@organon/core/scripts'), { recursive: true });
  await writeFile(path.join(dir, 'node_modules/@organon/core/scripts/install-service.sh'), '');
  assert.deepEqual(serviceScript(dir), [path.join(dir, 'node_modules/@organon/core/scripts/install-service.sh'), dir]);
  // A release from before it (Galen's main until 0.6.0): no core in node_modules, its own scripts/install-service.sh.
  const before = await scratch(t);
  await mkdir(path.join(before, 'scripts'), { recursive: true });
  await writeFile(path.join(before, 'scripts/install-service.sh'), '');
  assert.deepEqual(serviceScript(before), [path.join(before, 'scripts/install-service.sh')]);
});

/** A Git repository with an app.json, committed; returns its root and a git runner. */
async function repo(t: TestContext) {
  const home = await scratch(t);
  const root = path.join(home, 'Projects/probe');
  await mkdir(root, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  git('init', '--quiet', '-b', 'main');
  await writeFile(
    path.join(root, 'app.json'),
    JSON.stringify({
      name: 'probe',
      title: 'Probe',
      hostname: 'probe.test',
      loopback: '127.0.0.99',
      ports: { live: await freePort(), dev: await freePort(), tls: await freePort(), vite: await freePort() },
      defaultAccent: 'blue',
    }),
  );
  return { home, root, git };
}

/** Runs release() with its messages captured; a throw (from the deploy, here) is kept, not raised. */
async function releaseSaying(app: App, argv: string[]) {
  const said: string[] = [];
  const error = console.error;
  console.error = (m: unknown) => said.push(String(m));
  try {
    return { result: await release(app, argv).catch((e: Error) => e), said: said.join('\n') };
  } finally {
    console.error = error;
  }
}

test('A rollback checks the lockfile of the release it goes back to, not the checkout’s', async (t) => {
  const { home, root, git } = await repo(t);
  // The release before: pinned by URL, with its integrity.
  await writeFile(
    path.join(root, 'pnpm-lock.yaml'),
    "  '@organon/core@https://example.test/organon-core-0.7.0.tgz':\n    resolution: {integrity: sha512-x, tarball: https://example.test/organon-core-0.7.0.tgz}\n",
  );
  git('add', '-A');
  git('commit', '--quiet', '-m', 'on the core by URL');
  git('tag', 'live-previous');
  // Since then the checkout pinned the core by a path the release copy cannot reach (a release being tried in dev).
  await mkdir(path.join(home, 'Projects/Organon/releases'), { recursive: true });
  await writeFile(path.join(home, 'Projects/Organon/releases/organon-core-0.7.1.tgz'), 'x');
  await writeFile(
    path.join(root, 'pnpm-lock.yaml'),
    "  '@organon/core@file:../Organon/releases/organon-core-0.7.1.tgz':\n    resolution: {integrity: sha512-y, tarball: file:../Organon/releases/organon-core-0.7.1.tgz}\n",
  );
  git('commit', '--quiet', '-am', 'on the core by path');
  git('tag', 'live');
  const app = defineApp(root, { HOME: home });

  // The rollback goes on to deploy the release before (which fails here, past the checks: no package.json to install).
  const back = await releaseSaying(app, ['--rollback']);
  assert.doesNotMatch(back.said, /cannot reach/);
  assert.match(back.said, /Releasing [0-9a-f]+ on the core by URL/);
  assert.ok(back.result instanceof Error && /failed in/.test(back.result.message), String(back.result));

  // A release of HEAD is still refused, before anything: its own lockfile is the one the copy would install.
  const ahead = await releaseSaying(app, []);
  assert.equal(ahead.result, false);
  assert.match(ahead.said, /cannot reach/);
  assert.doesNotMatch(ahead.said, /Releasing/);
});

/** A stand-in for the live server: answers /api/health with whatever `health` holds now. */
async function liveServer(health: () => Record<string, unknown>) {
  const server = http.createServer((_req, res) => res.end(JSON.stringify(health())));
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return { port, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('A release is live only when the new commit answers, not the server that was there before', async () => {
  const dir = '/srv/probe/app';
  let health: Record<string, unknown> = { root: dir, pid: 100, commit: 'aaaaaaa' };
  const live = await liveServer(() => health);
  const quick = { tries: 3, every: 10 };
  try {
    // The service did not restart: the old server still answers from the same folder.
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'bbbbbbb', pidBefore: 100 }, quick), false);
    // A process that kept the pid's place but runs the old commit is not it either.
    health = { root: dir, pid: 200, commit: 'aaaaaaa' };
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'bbbbbbb', pidBefore: 100 }, quick), false);
    // The same commit rebuilt, but nothing restarted: still the old process.
    health = { root: dir, pid: 100, commit: 'bbbbbbb' };
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'bbbbbbb', pidBefore: 100 }, quick), false);
    // The new commit, in a new process, from the release copy.
    health = { root: dir, pid: 200, commit: 'bbbbbbb' };
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'bbbbbbb', pidBefore: 100 }, quick), true);
    // It comes up a moment later: the wait sees it.
    health = { root: dir, pid: 100, commit: 'aaaaaaa' };
    setTimeout(() => (health = { root: dir, pid: 300, commit: 'bbbbbbb' }), 50);
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'bbbbbbb', pidBefore: 100 }, { tries: 50, every: 10 }), true);
    // A release from before the server said its commit (a rollback across the move to the core): a new process will do.
    health = { root: dir, pid: 100 };
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'ccccccc', pidBefore: 100 }, quick), false);
    health = { root: dir, pid: 400 };
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'ccccccc', pidBefore: 100 }, quick), true);
    // Nothing was running before (a first release): the commit is enough.
    health = { root: dir, pid: 100, commit: 'bbbbbbb' };
    assert.equal(await releaseAnswers(live.port, { dir, sha: 'bbbbbbb', pidBefore: undefined }, quick), true);
  } finally {
    await live.close();
  }
});
