// Packs @organon/core at the version in its package.json into releases/organon-core-<version>.tgz: what an app
// installs. A version, once packed, is never packed again (as with a Debian upload): bump the version instead. The
// apps' lockfiles hold each tarball's hash, so a tarball rewritten under the same name would fail their install
// rather than change them silently.
//
//   pnpm pack:release            from a clean tree, after `pnpm gates` (the canary included), pack the version in
//                                packages/core/package.json, so every released tarball is a commit that passed
//   pnpm pack:release --to DIR   pack into DIR instead, overwriting, after the core's tests (canary.ts uses it)
//
// The tarballs are committed: an app's rollback goes back to a pin whose tarball is still here.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CORE = path.join(ROOT, 'packages/core');

export function pack(outDir: string, { overwrite = false } = {}): string {
  const { version } = JSON.parse(readFileSync(path.join(CORE, 'package.json'), 'utf8')) as { version: string };
  const target = path.join(outDir, `organon-core-${version}.tgz`);
  if (existsSync(target) && !overwrite) {
    throw new Error(`${path.relative(ROOT, target)} exists: a released version is never rewritten. Bump packages/core/package.json.`);
  }
  if (!overwrite) {
    const dirty = run('git', ['status', '--porcelain'], ROOT).trim();
    if (dirty) throw new Error(`The tree has changes not committed:\n${dirty}\nA release is packed from a commit.`);
    run('pnpm', ['gates'], ROOT);
  } else run('pnpm', ['test'], CORE);
  mkdirSync(outDir, { recursive: true });
  // prepack builds dist/ first; the tarball lands in outDir under pnpm's own name (organon-core-<version>.tgz).
  const out = run('pnpm', ['pack', '--pack-destination', outDir], CORE).trim().split('\n').at(-1) ?? '';
  const made = path.isAbsolute(out) ? out : path.join(outDir, path.basename(out));
  if (made !== target) renameSync(made, target);
  return target;
}

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

if (import.meta.main) {
  const to = process.argv.indexOf('--to');
  const outDir = to === -1 ? path.join(ROOT, 'releases') : path.resolve(process.argv[to + 1] ?? '');
  const file = pack(outDir, { overwrite: to !== -1 });
  const sha = createHash('sha512').update(readFileSync(file)).digest('base64');
  console.log(`${path.relative(process.cwd(), file)}\nintegrity sha512-${sha}`);
  if (to === -1) console.log('Next: commit it, push, then `pnpm publish:release` (scripts/publish.ts).');
}
