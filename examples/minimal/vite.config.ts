import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { organon } from '@organon/core/vite';

// The interface is in ui/ and builds to dist/ui, as in the apps. In dev, Vite serves it and passes /api and /mcp to
// the dev server (scripts/dev.ts starts both).
export default defineConfig({
  root: 'ui',
  // The core's plugin also sets Vite's port and its proxy to the dev server, from app.json.
  plugins: [svelte(), organon({ root: import.meta.dirname })],
  build: { outDir: '../dist/ui', emptyOutDir: true },
});
