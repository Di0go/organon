// Tries the core as it is in this working tree against an app, before any app moves to it: the app is copied to a
// throwaway folder (a git clone of its committed state, or a plain copy), its @organon/core is pointed at a tarball
// packed from here, and its own checks run there. The app's checkout, its branches, its data/ and its running
// instances are never touched: Debian's autopkgtest of reverse dependencies, for the saga.
//
//   pnpm canary examples/minimal                      the example, `pnpm test`
//   pnpm canary ~/Projects/Galen --run "pnpm gates"   an app, with its own gates
//   pnpm canary ~/Projects/Galen --ref organon        that branch, not whatever is checked out
//
// An app that is not on the core yet is a failure, not a pass: a canary that skips has tested nothing. The app's
// browser tests must run, not skip (ORGANON_REQUIRE_CHROMIUM=1), and no <APP>_* variable of this shell reaches them.
//
// Exit 0 when every app passed. A red canary means: fix the core, or make it a new major version with the change
// the app needs written in CHANGELOG.md (docs/plano.md, "Como uma correcção chega às apps").

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from './pack.ts';

const args = process.argv.slice(2);
const runAt = args.indexOf('--run');
const command = runAt === -1 ? 'pnpm test' : (args[runAt + 1] ?? 'pnpm test');
const refAt = args.indexOf('--ref');
const ref = refAt === -1 ? undefined : args[refAt + 1];
const values = new Set([runAt, refAt].filter((i) => i !== -1).map((i) => i + 1));
const apps = args.filter((a, i) => !a.startsWith('--') && !values.has(i));
if (!apps.length) {
  console.error('Usage: pnpm canary <app folder>… [--run "<command>"]');
  process.exit(2);
}

const work = mkdtempSync(path.join(tmpdir(), 'organon-canary-'));
const tarball = pack(path.join(work, 'core'), { overwrite: true });
console.log(`Core packed from the working tree: ${tarball}`);

let failed = 0;
for (const app of apps) {
  const source = path.resolve(app);
  const name = path.basename(source);
  const copy = path.join(work, name);
  if (existsSync(path.join(source, '.git'))) {
    // Only what is committed: data/ is never in an app's repository, and nothing in the checkout is changed.
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', ...(ref ? ['--branch', ref] : []), source, copy]);
  } else {
    const skip = new Set(['node_modules', 'dist', 'data', '.dev']);
    cpSync(source, copy, { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
  }
  const manifest = path.join(copy, 'package.json');
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> };
  const was = pkg.dependencies?.['@organon/core'];
  if (!was) {
    console.log(`\n${name}: FAIL, not on the core (no @organon/core in its dependencies${ref ? '' : '; --ref <branch>?'})`);
    failed++;
    continue;
  }
  pkg.dependencies = { ...pkg.dependencies, '@organon/core': `file:${tarball}` };
  writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`\n${name}: @organon/core ${was} -> this working tree; running \`${command}\` in ${copy}`);
  const steps = [
    ['pnpm', 'install', '--no-frozen-lockfile', '--prefer-offline', '--silent'],
    ['bash', '-c', command],
  ];
  // The shell's own app settings (GALEN_DATA_DIR…) never reach the copy's tests; the browser tests must not skip.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ARISTOTLE|GALEN|ARGUS|MINIMAL)_/.test(k)));
  env.ORGANON_REQUIRE_CHROMIUM = '1';
  const ok = steps.every(([cmd, ...rest]) => spawnSync(cmd ?? '', rest, { cwd: copy, stdio: 'inherit', env }).status === 0);
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) failed++;
}

if (failed) console.log(`\nCanary: ${apps.length - failed} of ${apps.length} passed. Copies kept in ${work}`);
else {
  rmSync(work, { recursive: true, force: true });
  console.log(`\nCanary: ${apps.length} of ${apps.length} passed.`);
}
process.exit(failed ? 1 : 0);
