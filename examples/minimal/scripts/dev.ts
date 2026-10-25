// pnpm dev: the dev instance (its own port and folders in .dev/) and Vite side by side, as in the apps. Ctrl+C stops both.

import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, MINIMAL_INSTANCE: 'dev' };
const server = spawn(process.execPath, ['--watch', 'server/index.ts'], { cwd: ROOT, env, stdio: 'inherit' });
const vite = spawn('pnpm', ['exec', 'vite'], { cwd: ROOT, env, stdio: 'inherit' });
const stop = () => {
  server.kill();
  vite.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of [server, vite]) child.on('exit', stop);
