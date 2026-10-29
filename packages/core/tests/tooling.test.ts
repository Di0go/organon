// gates.ts and stop-hook.ts: the checks a change must pass in one command, and the Stop hook that sends an agent back
// to a doc its change left behind. Aristotle's and Galen's scripts/gates.ts and claude-stop-hook.ts, the same file
// but for names, now with the app's gates and doc zones handed in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { undocumented } from '../src/server/stop-hook.ts';

const ZONES = [
  { name: 'server', code: /^server\//, docs: ['docs/architecture.md'] },
  { name: 'tooling', code: /^scripts\//, docs: ['docs/development.md'] },
];

test('undocumented: each zone whose code changed and none of whose docs did', () => {
  assert.deepEqual(undocumented(ZONES, ['server/a.ts', 'scripts/b.ts', 'docs/development.md']), [
    { name: 'server', files: ['server/a.ts'], docs: ['docs/architecture.md'] },
  ]);
  assert.deepEqual(undocumented(ZONES, ['README.md']), []);
});

test("runGates runs the app's gates, the quick ones alone with --quick, and stops at the first failure with its output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'organon-gates-'));
  try {
    const script = path.join(root, 'gates.ts');
    const gates = path.join(import.meta.dirname, '../src/server/gates.ts');
    await writeFile(
      script,
      `import { runGates } from ${JSON.stringify(gates)};
await runGates(${JSON.stringify(root)}, [
  { name: 'first', command: ['node', '-e', 'console.log("one")'], quick: true },
  { name: 'second', command: ['node', '-e', process.argv.includes('--fail') ? 'console.log("broke"); process.exit(3)' : '0'] },
  { name: 'after', command: ['node', '-e', 'require("fs").writeFileSync("after", "ran")'], after: 'second' },
], process.argv.slice(2));`,
    );
    const quick = spawnSync(process.execPath, [script, '--quick'], { encoding: 'utf8' });
    assert.equal(quick.status, 0);
    assert.match(quick.stderr, /✓ first/);
    assert.doesNotMatch(quick.stderr, /second/);
    const all = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(all.status, 0, all.stderr);
    assert.match(all.stderr, /All gates passed/);
    const failing = spawnSync(process.execPath, [script, '--fail'], { encoding: 'utf8' });
    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /broke\n\n✗ second/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the Stop hook sends the agent back when code changed without its docs, never in the drawer', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'organon-stophook-'));
  try {
    const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    git('init', '--quiet');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    await writeFile(
      path.join(root, 'app.json'),
      JSON.stringify({
        name: 'probe',
        title: 'Probe',
        hostname: 'probe.test',
        loopback: '127.0.0.99',
        ports: { live: 4999, dev: 4998, tls: 4997, vite: 4996 },
      }),
    );
    git('add', '.');
    git('commit', '--quiet', '-m', 'start');
    await writeFile(path.join(root, 'server.ts'), '');
    await writeFile(path.join(root, 'x.ts'), '');
    const hook = path.join(import.meta.dirname, '../src/server/stop-hook.ts');
    const script = path.join(root, 'hook.ts');
    await writeFile(
      script,
      `import { runStopHook } from ${JSON.stringify(hook)};
await runStopHook(${JSON.stringify(root)}, { zones: [{ name: 'code', code: /\\.ts$/, docs: ['docs/a.md'] }], generate: async () => [] });`,
    );
    const run = (env: NodeJS.ProcessEnv = {}) =>
      spawnSync(process.execPath, [script], {
        input: JSON.stringify({}),
        encoding: 'utf8',
        env: { ...process.env, PROBE_DRAWER: '', ...env },
      });
    const sent = run();
    assert.equal(sent.status, 0, sent.stderr);
    const said = JSON.parse(sent.stdout) as { decision: string; reason: string };
    assert.equal(said.decision, 'block');
    assert.match(said.reason, /- code: .*server\.ts.*Docs: docs\/a\.md\./);
    assert.equal(run({ PROBE_DRAWER: '1' }).stdout, '', 'the drawer is the app in use, not development');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
