// `pnpm dev`: the dev instance (its own port and folders in .dev/, restarted on every server change) and Vite with hot
// reload in front of it, side by side; Ctrl+C, or either one failing, stops both. Nothing here can touch the live app
// or data/. The app's scripts/dev.ts is one line: runDev(ROOT). From Galen's scripts/dev.ts.

import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { type App, defineApp, readAppJson } from './app.ts';

/** The app at `root` as its dev instance: <PREFIX>_INSTANCE=dev in `env`, whatever the shell had. */
export function devApp(root: string, env: NodeJS.ProcessEnv = process.env): { app: App; env: NodeJS.ProcessEnv } {
  const prefix = readAppJson(root).name.toUpperCase().replace(/-/g, '_');
  const devEnv = { ...env, [`${prefix}_INSTANCE`]: 'dev' };
  return { app: defineApp(root, devEnv), env: devEnv };
}

export function runDev(root: string, { banner = '' }: { banner?: string } = {}): App {
  const { app, env: base } = devApp(root);
  const env = {
    ...base,
    [`${app.prefix}_PORT`]: String(app.port),
    [`${app.prefix}_VITE_PORT`]: String(app.vitePort),
    // The server restarts on every save: Node keeps it compiled between restarts.
    NODE_COMPILE_CACHE: path.join(app.root, '.dev/state/compile-cache'),
  };
  const children: ChildProcess[] = [
    spawn(process.execPath, ['--watch', '--watch-preserve-output', 'server/index.ts'], { cwd: app.root, env, stdio: 'inherit' }),
    spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: app.root, env, stdio: 'inherit' }),
  ];
  console.error(
    `\n  ${app.title} dev  http://localhost:${app.vitePort}  (hot reload)\n` +
      `  server     http://localhost:${app.port}  (restarts on change)\n` +
      `  data       ${path.relative(app.root, app.dataDir)}\n${banner}`,
  );
  const stop = () => {
    for (const c of children) c.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  for (const c of children) c.on('exit', (code) => code && stop());
  return app;
}
