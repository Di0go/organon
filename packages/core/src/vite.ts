// What every app's vite.config.ts needs from the core: theme-boot.js at /theme-boot.js, served in dev and put in the
// build, so index.html loads the core's copy and no app keeps one of its own (the two apps' copies had drifted: the
// accent list, the old "mind-gym.look" key).
//
//   import { organon } from '@organon/core/vite';
//   export default defineConfig({ plugins: [svelte(), organon({ root: import.meta.dirname })] });
//
// Given the app's root, it also sets Vite's port and its proxy to the dev server from app.json (ports.vite, ports.dev,
// or <PREFIX>_VITE_PORT and <PREFIX>_PORT), so no app writes them again.

import { readFileSync } from 'node:fs';
import type { Plugin, UserConfig } from 'vite';
import { readAppJson } from './server/app.ts';

const BOOT = new URL('../src/ui/theme-boot.js', import.meta.url);

export function organon({ root }: { root?: string } = {}): Plugin {
  const boot = () => readFileSync(BOOT, 'utf8');
  const server = (): UserConfig['server'] => {
    if (!root) return undefined;
    const app = readAppJson(root);
    const prefix = app.name.toUpperCase().replace(/-/g, '_');
    const target = `http://127.0.0.1:${process.env[`${prefix}_PORT`] || app.ports.dev}`;
    return {
      port: Number(process.env[`${prefix}_VITE_PORT`] || app.ports.vite),
      strictPort: true,
      // /api carries WebSockets too: the terminal drawer's (/api/terminal) goes through Vite in dev.
      proxy: { '/api': { target, ws: true }, '/mcp': target },
    };
  };
  return {
    name: 'organon',
    // The core's interface comes as source (.svelte, .svelte.ts). Vite's dependency pre-bundling compiles a
    // .svelte.ts without stripping its types and stops the dev server ("Unexpected token" at `type Accent`); left out
    // of it, the core goes through the same transforms as the app's own files, as it does in the build.
    config: () => ({ optimizeDeps: { exclude: ['@organon/core'] }, server: server() }),
    configureServer(server) {
      server.middlewares.use('/theme-boot.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(boot());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'theme-boot.js', source: boot() });
    },
  };
}
