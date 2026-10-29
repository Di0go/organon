// The dev instance starts and draws its page: Vite serving the interface from source, as `pnpm dev` does, with the
// core in node_modules. The build alone does not prove it: 0.1.0's interface built, yet `pnpm dev` stopped at start
// (Vite's pre-bundling and the core's .svelte.ts). And the first page has the core's Markdown on it, whose
// dependencies (marked, DOMPurify, KaTeX, Mermaid) are the core's alone: found late, they would be optimised with the
// page already loading (504 "Outdated Optimize Dep", then a reload). Skipped where there is no Chromium.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { checkMarkdown, freePort, type Running, start } from './helpers.ts';

const CHROMIUM = [process.env.MINIMAL_TEST_CHROMIUM, '/usr/bin/chromium', chromium.executablePath()].find((p): p is string =>
  Boolean(p && existsSync(p)),
);
// In the canary the browser tests must run: a missing Chromium is a failure there, not a skip.
if (!CHROMIUM && process.env.ORGANON_REQUIRE_CHROMIUM) throw new Error('No Chromium, and ORGANON_REQUIRE_CHROMIUM is set');

let app: Running;
let vite: ChildProcess;
let base = '';
let browser: Browser | undefined;
let viteLog = '';

before(async () => {
  app = await start();
  const port = await freePort();
  base = `http://localhost:${port}`;
  vite = spawn('pnpm', ['exec', 'vite', '--force'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, MINIMAL_VITE_PORT: String(port), MINIMAL_PORT: new URL(app.base).port },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const s of [vite.stdout, vite.stderr]) s?.on('data', (d: Buffer) => (viteLog += d.toString()));
  if (CHROMIUM) browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
});

after(async () => {
  await browser?.close();
  vite.kill();
  void app.stop();
});

test('pnpm dev: Vite serves the page from source and it draws, with no error', { skip: !CHROMIUM }, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await page.goto(base);
  await page.getByRole('button', { name: 'Red' }).click({ timeout: 10_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'red');
  await checkMarkdown(page);
  // The accent changed while the diagram was first drawn (Mermaid takes a second to load): it is drawn in the new one.
  assert.equal(await page.getByTestId('markdown').locator('figure.diagram').getAttribute('data-look'), 'dark|red');
  assert.deepEqual(errors, []);
  assert.doesNotMatch(viteLog, /error/i, viteLog);
  // Nothing was found after the start: no new dependencies optimised, no reload.
  assert.doesNotMatch(viteLog, /new dependencies optimized|optimized dependencies changed|reloading/i, viteLog);
  await page.close();
});
