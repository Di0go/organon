// Ships what is committed in an app to the instance he uses, without ever running half-finished code. The app's
// scripts/release.ts is two lines: defineApp, then release.
//
// The live app runs from a release copy (a Git worktree, ~/.local/share/<name>/app by default) checked out at a fixed
// commit, while its data and state stay in the working checkout's data/ and .<name>/. A release:
//   1. refuses uncommitted changes, then runs the app's gates (`pnpm gates`);
//   2. checks the commit out in the release copy, installs (frozen lockfile: the core's tarball by its hash) and
//      builds there;
//   3. points <name>.service at it (the core's install-service.sh, from the release copy's own node_modules) and
//      restarts it;
//   4. checks it answers from the new copy; if not, puts the previous release back.
// The tag `live` marks what is running; `git log live..` is what is not released yet.
//
//   pnpm release              release HEAD
//   pnpm release --rollback   go back to the release before (tag live-previous), without gates
//
// From Galen's scripts/release.ts.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import type { App } from './app.ts';

export async function release(app: App, argv = process.argv.slice(2)): Promise<boolean> {
  const ROOT = app.root;
  const say = (m: string) => console.error(m);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  /** The commit a tag points at, or undefined if there is no such tag. */
  const tag = (name: string) => {
    try {
      return git('rev-parse', '--verify', '--quiet', `refs/tags/${name}^{commit}`);
    } catch {
      return undefined;
    }
  };
  const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}`);
  };
  const dataDir = app.env('DATA_DIR') ?? path.join(ROOT, 'data');
  const stateDir = app.env('STATE_DIR') ?? path.join(ROOT, `.${app.name}`);

  /** The checkout the live server says it runs from, once it answers (up to 10 s). */
  async function liveRoot(): Promise<string | undefined> {
    for (let i = 0; i < 50; i++) {
      try {
        const h = (await (await fetch(`http://127.0.0.1:${app.port}/api/health`)).json()) as { root?: string };
        if (h.root) return h.root;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    return undefined;
  }

  /** Checks `sha` out in the release copy, builds it and restarts the service on it. */
  async function deploy(sha: string): Promise<boolean> {
    const dir = app.releaseDir;
    if (!existsSync(dir)) run('git', ['worktree', 'add', '--detach', dir, sha], ROOT);
    else run('git', ['checkout', '--quiet', '--detach', sha], dir);
    // An agent started in the release copy may read data/ there: give it the real data/ under the same name.
    const dataLink = path.join(dir, 'data');
    if (!existsSync(dataLink) && !isLink(dataLink)) symlinkSync(dataDir, dataLink);
    run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent'], dir);
    run('pnpm', ['run', '--silent', 'build'], dir);
    run('bash', [path.join(dir, 'node_modules/@organon/core/scripts/install-service.sh'), dir], dir, {
      ...process.env,
      [`${app.prefix}_DATA_DIR`]: dataDir,
      [`${app.prefix}_STATE_DIR`]: stateDir,
    });
    return (await liveRoot()) === dir;
  }

  // 0. A pin the release copy could not install is refused before anything is built or stopped.
  let lock = '';
  try {
    lock = readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8');
  } catch {}
  const unreachable = unreachablePins(lock, ROOT, app.releaseDir);
  if (unreachable.length) {
    say(
      `The lockfile names ${unreachable.join(', ')} by a path relative to this checkout, which the release copy in ` +
        `${app.releaseDir} cannot reach (pnpm writes file: pins relative). Pin the core to its GitHub release URL.`,
    );
    return false;
  }

  // 1. Refuse uncommitted changes and run the gates (not for a rollback, which goes back to a release that passed).
  const rollback = argv.includes('--rollback');
  const previous = tag('live');
  const target = rollback ? tag('live-previous') : git('rev-parse', 'HEAD');
  if (!target) throw new Error('Nothing to roll back to: there is no live-previous tag yet.');
  if (!rollback) {
    if (git('status', '--porcelain', '--untracked-files=no')) {
      say('Uncommitted changes: commit them first. A release is always a commit you can go back to.');
      return false;
    }
    if (target === previous) say(`${target.slice(0, 7)} is already live; rebuilding it.`);
    run('pnpm', ['gates'], ROOT);
  }

  // 2 to 4. Deploy it; move the tags if it came up, put the previous release back if it did not.
  say(`Releasing ${git('log', '-1', '--format=%h %s', target)} to ${app.releaseDir}`);
  if (await deploy(target)) {
    if (previous && previous !== target) git('tag', '-f', 'live-previous', previous);
    git('tag', '-f', 'live', target);
    say(`Live: ${target.slice(0, 7)} at ${app.url}. Rollback: pnpm release --rollback`);
    return true;
  }
  say('The new release did not come up.');
  if (previous && previous !== target) {
    say(`Putting ${previous.slice(0, 7)} back.`);
    say(
      (await deploy(previous)) ? 'Previous release restored.' : `The previous release did not come up either: see ${stateDir}/server.log.`,
    );
  }
  return false;
}

/**
 * The local tarballs a lockfile names (`tarball: file:<path>`) that are there from the app's checkout but not from
 * `dir`, where the release copy installs. pnpm writes a file: pin relative to the lockfile, even one given as an
 * absolute path, so a pin on releases/ by path works in the checkout and fails in the copy.
 */
export function unreachablePins(lock: string, root: string, dir: string): string[] {
  const out = new Set<string>();
  for (const m of lock.matchAll(/tarball: file:([^,}\s]+)/g)) {
    const p = m[1] ?? '';
    if (existsSync(path.resolve(root, p)) && !existsSync(path.resolve(dir, p))) out.add(p);
  }
  return [...out];
}

/** Whether `p` is a symbolic link, even a broken one (which existsSync reports as missing). */
function isLink(p: string) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
