// Every check a change must pass, in one command: the same list runs in the pre-push hook, in CI and before a release.
// The checks that don't depend on each other run side by side, and one that needs another (the tests, the build) starts
// as soon as that one is done. Each one's output is held and shown only if it fails; the first failure stops the rest.
// The app's scripts/gates.ts names its gates and calls runGates.
//
//   pnpm gates            everything
//   pnpm gates --quick    the fast ones only (the pre-commit hook)
//
// From Aristotle's and Galen's scripts/gates.ts, which were the same file.

import { type ChildProcess, spawn } from 'node:child_process';

export interface Gate {
  name: string;
  command: string[];
  /** One of the fast ones, run by --quick. */
  quick?: boolean;
  /** A gate that must pass first. */
  after?: string;
}

/** Runs `gates` in `root` (all, or the quick ones with --quick in `argv`); exits 1 at the first failure. */
export async function runGates(root: string, gates: Gate[], argv: string[] = process.argv.slice(2)): Promise<void> {
  const quick = argv.includes('--quick');
  const running = new Set<ChildProcess>();
  const started = performance.now();

  /** Runs one gate, resolving when it passes; on a failure, prints its output, stops the others and exits. */
  function run(gate: Gate): Promise<void> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const [cmd = '', ...args] = gate.command;
      const child = spawn(cmd, args, { cwd: root, env: { ...process.env, FORCE_COLOR: '1' } });
      running.add(child);
      let output = '';
      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));
      child.on('close', (code) => {
        running.delete(child);
        const seconds = ((performance.now() - t0) / 1000).toFixed(1);
        if (code !== 0) {
          for (const other of running) other.kill();
          process.stderr.write(`${output}\n✗ ${gate.name} (${seconds}s): ${gate.command.join(' ')}\n`);
          process.exit(1);
        }
        console.error(`✓ ${gate.name} (${seconds}s)`);
        resolve();
      });
    });
  }

  const chosen = gates.filter((g) => !quick || g.quick);
  const done = new Map<string, Promise<void>>();
  for (const gate of chosen) {
    const before = gate.after ? done.get(gate.after) : undefined;
    done.set(gate.name, before ? before.then(() => run(gate)) : run(gate));
  }
  await Promise.all(done.values());
  if (!quick) console.error(`All gates passed in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
}
