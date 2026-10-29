// vite.ts: the plugin every app's vite.config.ts uses. Given the app's root, Vite's port and its proxy come from
// app.json; the proxy carries WebSockets on /api (Galen's and Aristotle's terminal drawer, /api/terminal, goes
// through Vite in dev), and the core stays out of Vite's pre-bundling while its interface's dependencies are in it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organon } from '../src/vite.ts';
import { fixtureApp } from './fixture-app.ts';

test("The plugin takes Vite's port and proxy from app.json, WebSockets on /api included", async () => {
  const app = await fixtureApp();
  const config = (organon({ root: app.root }).config as () => Record<string, unknown>)() as {
    optimizeDeps: { exclude: string[]; include: string[] };
    server: { port: number; proxy: Record<string, string | { target: string; ws?: boolean }> };
  };
  assert.deepEqual(config.optimizeDeps.exclude, ['@organon/core']);
  // The dependency scan treats the core as external: crawling its .svelte files it failed on their own relative
  // imports ("Could not resolve './LookPicker.svelte'"), gave up pre-bundling, and the app's dependencies were found
  // with the page already loading (504 Outdated Optimize Dep, a reload). Found by Galen's dev test.
  const scan = (config.optimizeDeps as { rolldownOptions?: { plugins?: { resolveId: (id: string) => unknown }[] } }).rolldownOptions
    ?.plugins?.[0];
  assert.deepEqual(scan?.resolveId('@organon/core/ui/Ribbon.svelte'), { id: '@organon/core/ui/Ribbon.svelte', external: true });
  assert.equal(scan?.resolveId('marked'), null);
  // So the dependencies only the core's interface imports are never found by the scan: they are pre-bundled from the
  // start, by way of the core (pnpm puts them out of the app's reach), or the first page with Markdown on it would
  // find them late, the same 504. Mermaid and KaTeX are imported lazily, which the scan would not follow either.
  assert.deepEqual(config.optimizeDeps.include, [
    '@organon/core > marked',
    '@organon/core > dompurify',
    '@organon/core > katex',
    '@organon/core > mermaid',
  ]);
  assert.equal(config.server.port, app.vitePort);
  const target = `http://127.0.0.1:${app.port}`;
  // As the short form ('/api': target) had it: the Host the dev server sees is its own.
  assert.deepEqual(config.server.proxy['/api'], { target, changeOrigin: true, ws: true });
  assert.equal(config.server.proxy['/mcp'], target);
});
