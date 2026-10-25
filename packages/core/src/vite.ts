// What every app's vite.config.ts needs from the core: theme-boot.js at /theme-boot.js, served in dev and put in the
// build, so index.html loads the core's copy and no app keeps one of its own (the two apps' copies had drifted: the
// accent list, the old "mind-gym.look" key).
//
//   import { organon } from '@organon/core/vite';
//   export default defineConfig({ plugins: [svelte(), organon()] });

import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const BOOT = new URL('../src/ui/theme-boot.js', import.meta.url);

export function organon(): Plugin {
  const boot = () => readFileSync(BOOT, 'utf8');
  return {
    name: 'organon',
    // The core's interface comes as source (.svelte, .svelte.ts). Vite's dependency pre-bundling compiles a
    // .svelte.ts without stripping its types and stops the dev server ("Unexpected token" at `type Accent`); left out
    // of it, the core goes through the same transforms as the app's own files, as it does in the build.
    config: () => ({ optimizeDeps: { exclude: ['@organon/core'] } }),
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
