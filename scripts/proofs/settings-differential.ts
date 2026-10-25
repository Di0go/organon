// The app's own settings.ts against the core's, on two copies of the app's real settings.json (mode 600, in a private
// temp folder, deleted at the end): the same view before and after the same changes, the same file, the same
// endpoint, and the app's own keys kept. Prints hashes, never values. The model for the differential test of each
// module a migration step replaces.
//
//   node scripts/proofs/settings-differential.ts Galen
//
// Reads ~/Projects/<App>/.<app>/settings.json; writes nothing there.

import { createHash } from 'node:crypto';
import { copyFileSync, chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const app = process.argv[2] ?? 'Galen';
const lower = app.toLowerCase();
const prefix = app.toUpperCase();
const real = path.join(homedir(), 'Projects', app, `.${lower}`, 'settings.json');
const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex')
    .slice(0, 16);

// Run in a child, so each implementation reads its own copy and its module state is its own.
if (process.argv[3] === '--run') {
  const [, , , , which, file] = process.argv;
  let s: {
    view(i: (id: string) => boolean): unknown;
    update(b: unknown): Promise<void>;
    endpoint(): unknown;
  };
  if (which === 'core') {
    const { createSettings } = await import('../../packages/core/src/server/settings.ts');
    const { Warnings } = await import('../../packages/core/src/server/warnings.ts');
    s = createSettings({ file: file ?? '', warnings: new Warnings() });
  } else s = (await import(which ?? '')).settings;
  const installed = (id: string) => id === 'claude-code';
  const out = [`view0 ${hash(s.view(installed))}`];
  await s.update({ tutor: 'codex' });
  await s.update({ helpers: 'api', api: { provider: 'ollama', model: 'qwen3:8b' } });
  await s.update({ api: { apiKey: 'sk-test-0123456789', baseUrl: 'http://localhost:11434/v1/' } });
  out.push(`view1 ${hash(s.view(installed))}`, `file ${hash(readFileSync(file ?? '', 'utf8'))}`, `endpoint ${hash(s.endpoint())}`);
  console.log(out.join('\n'));
  process.exit(0);
}

let code = 1;
const dir = mkdtempSync(path.join(tmpdir(), 'organon-differential-'));
chmodSync(dir, 0o700);
try {
  const orig = path.join(dir, 'orig.json');
  const core = path.join(dir, 'core.json');
  for (const f of [orig, core]) {
    copyFileSync(real, f);
    chmodSync(f, 0o600);
  }
  const env = {
    ...process.env,
    [`${prefix}_SETTINGS`]: orig,
    [`${prefix}_STATE_DIR`]: path.join(dir, 'state'),
    [`${prefix}_DATA_DIR`]: path.join(dir, 'data'),
    [`${prefix}_API_KEY`]: '',
  };
  const me = import.meta.filename;
  const run = (which: string, file: string) =>
    spawnSync(process.execPath, [me, app, '--run', which, file], { env, encoding: 'utf8' }).stdout.trim().split('\n');
  const a = run(path.join(homedir(), 'Projects', app, 'server', 'settings.ts'), orig);
  const b = run('core', core);
  let same = a.length === 4;
  for (const [i, line] of a.entries()) {
    const ok = line === b[i];
    same &&= ok;
    console.log(`${line.padEnd(26)} ${ok ? 'same' : `DIFFERENT (core: ${b[i]})`}`);
  }
  const own = (f: string) => {
    const { tutor, helpers, api, ...rest } = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
    return hash(rest);
  };
  const kept = own(core) === own(real);
  console.log(`the app's own keys kept: ${kept ? 'yes' : 'NO'}`);
  code = same && kept ? 0 : 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
