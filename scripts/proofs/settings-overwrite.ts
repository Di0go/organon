// The defect the core fixes, on an app's own code: its settings.ts reads a settings.json with a stray comma as empty,
// and the next change writes over it. On a temp file, never the app's own.
//
//   node scripts/proofs/settings-overwrite.ts Galen

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const app = process.argv[2] ?? 'Galen';
if (process.argv[3] === '--run') {
  const { settings } = await import(path.join(homedir(), 'Projects', app, 'server', 'settings.ts'));
  await settings.update({ tutor: 'codex' });
  process.exit(0);
}
const dir = mkdtempSync(path.join(tmpdir(), 'organon-overwrite-'));
const file = path.join(dir, 'settings.json');
const before = '{\n  "agentCommand": "my-claude --flag",\n  "health": { "token": "abcd-efgh-jkmn-pqrs-tuvw" },\n}\n';
writeFileSync(file, before);
const P = app.toUpperCase();
spawnSync(process.execPath, [import.meta.filename, app, '--run'], {
  env: { ...process.env, [`${P}_SETTINGS`]: file, [`${P}_STATE_DIR`]: path.join(dir, 's'), [`${P}_DATA_DIR`]: path.join(dir, 'd') },
});
const after = readFileSync(file, 'utf8');
rmSync(dir, { recursive: true, force: true });
console.log(`before:\n${before}after:\n${after}${after.includes('agentCommand') ? 'kept' : 'LOST: written over'}`);
