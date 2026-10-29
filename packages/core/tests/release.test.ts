// release.ts: a pin the release copy could not install is found before anything is built, stopped or restarted.
// Found on Argus's first release: pnpm writes a file: pin relative to the lockfile, so a tarball in releases/ named
// by an absolute path in package.json is ../Organon/releases/… in the lockfile, which the copy in
// ~/.local/share/<app>/app does not have.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serviceScript, unreachablePins, unverifiedPins } from '../src/server/release.ts';

test('A file: pin relative to the checkout is unreachable from the release copy; a URL pin is not a path', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'organon-release-'));
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

test("A rollback to a release from before the core installs the service with that release's own script", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'organon-release-'));
  // A release on the core: the core's script, from its own node_modules.
  await mkdir(path.join(dir, 'node_modules/@organon/core/scripts'), { recursive: true });
  await writeFile(path.join(dir, 'node_modules/@organon/core/scripts/install-service.sh'), '');
  assert.deepEqual(serviceScript(dir), [path.join(dir, 'node_modules/@organon/core/scripts/install-service.sh'), dir]);
  // A release from before it (Galen's main until 0.6.0): no core in node_modules, its own scripts/install-service.sh.
  const before = await mkdtemp(path.join(tmpdir(), 'organon-release-'));
  await mkdir(path.join(before, 'scripts'), { recursive: true });
  await writeFile(path.join(before, 'scripts/install-service.sh'), '');
  assert.deepEqual(serviceScript(before), [path.join(before, 'scripts/install-service.sh')]);
});
