// Publishes a packed version on GitHub: a release v<version> on the commit that added its tarball, with the tarball
// attached and its CHANGELOG.md section as the notes. That release's URL is what an app pins, so a public clone of
// an app installs the core with nothing from this machine. Like pack:release, it never rewrites: a version already
// released is refused, and the attached file is downloaded back and checked against the one in releases/.
//
//   pnpm publish:release            the version in packages/core/package.json, after `pnpm pack:release` and a push
//   pnpm publish:release 0.2.0      that version, if its tarball is in releases/
//
// It runs as the repository's owner (`gh auth token --user Di0go`), whichever gh account is active.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const REPO = 'Di0go/organon';
const OWNER = 'Di0go';
const ROOT = path.resolve(import.meta.dirname, '..');
const CORE = path.join(ROOT, 'packages/core');

/** The URL an app pins for this version. */
export const releaseUrl = (version: string) => `https://github.com/${REPO}/releases/download/v${version}/organon-core-${version}.tgz`;

/** The section of CHANGELOG.md under `## <version>`, without its heading. */
export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const start = lines.indexOf(`## ${version}`);
  if (start === -1) throw new Error(`packages/core/CHANGELOG.md has no "## ${version}": say what an app must change first.`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

function publish(version: string) {
  const rel = `releases/organon-core-${version}.tgz`;
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) throw new Error(`${rel} is not there: pnpm pack:release first.`);
  const commit = git('log', '--diff-filter=A', '--format=%H', '--', rel).trim().split('\n').at(-1);
  if (!commit) throw new Error(`${rel} is not committed: a release is published from a commit.`);
  git('fetch', '--quiet', 'origin');
  if (!ok('git', ['merge-base', '--is-ancestor', commit, 'origin/main'])) {
    throw new Error(`${commit.slice(0, 7)}, which added ${rel}, is not on origin/main: push first.`);
  }
  const env = { ...process.env, GH_TOKEN: run('gh', ['auth', 'token', '--user', OWNER]).trim() };
  if (ok('gh', ['release', 'view', `v${version}`, '--repo', REPO], env)) {
    throw new Error(`v${version} is already released: a released version is never rewritten. Bump packages/core/package.json.`);
  }
  const notes = `${changelogSection(readFileSync(path.join(CORE, 'CHANGELOG.md'), 'utf8'), version)}

**Install**, pinned (the lockfile keeps the tarball's hash):

\`\`\`sh
pnpm add ${releaseUrl(version)}
\`\`\`
`;
  run(
    'gh',
    ['release', 'create', `v${version}`, file, '--repo', REPO, '--target', commit, '--title', `@organon/core ${version}`, '--notes', notes],
    env,
  );
  // What GitHub serves must be the very file an app's lockfile will hash.
  const served = execFileSync('curl', ['-fsSL', releaseUrl(version)]);
  if (sha(served) !== sha(readFileSync(file))) throw new Error(`${releaseUrl(version)} is not ${rel}: delete the release and look.`);
  console.log(`${releaseUrl(version)}\nintegrity sha512-${sha(served)}`);
}

const sha = (b: Buffer) => createHash('sha512').update(b).digest('base64');
const git = (...args: string[]) => run('git', args);

function run(cmd: string, args: string[], env = process.env): string {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'inherit'] });
}

function ok(cmd: string, args: string[], env = process.env): boolean {
  try {
    execFileSync(cmd, args, { cwd: ROOT, env, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const version = process.argv[2] ?? (JSON.parse(readFileSync(path.join(CORE, 'package.json'), 'utf8')) as { version: string }).version;
  publish(version);
}
