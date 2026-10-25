import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { organon } from '@organon/core/vite';

// The interface is in ui/ and builds to dist/ui, as in the apps. In dev, Vite serves it and passes /api to the dev
// server (scripts/dev.ts starts both).
export default defineConfig({
  root: 'ui',
  plugins: [svelte(), organon()],
  build: { outDir: '../dist/ui', emptyOutDir: true },
  server: {
    port: Number(process.env.MINIMAL_VITE_PORT ?? 5193),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.MINIMAL_PORT ?? 4970}` },
  },
});
