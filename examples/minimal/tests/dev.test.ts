// The dev instance starts and draws its page: Vite serving the interface from source, as `pnpm dev` does, with the
// core in node_modules. The build alone does not prove it: 0.1.0's interface built, yet `pnpm dev` stopped at start
// (Vite's pre-bundling and the core's .svelte.ts). Skipped where there is no Chromium.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { freePort, type Running, start } from './helpers.ts';

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
  const port = await freePort();
  // The server is told Vite's port, so the pages Vite serves are its own (the drawer's WebSocket checks the Origin).
  app = await start(undefined, undefined, { VITE_PORT: String(port) });
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
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await page.goto(base);
  await page.getByRole('button', { name: 'Red' }).click({ timeout: 10_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'red');
  // The drawer's terminal loads xterm, which only the core imports: pre-bundled through the core (organon()), or the
  // page would get 504 Outdated Optimize Dep and reload. Its WebSocket comes through Vite's proxy.
  await page.keyboard.press('Control+`');
  const drawer = page.getByRole('region', { name: "Claude's drawer" });
  await drawer.getByRole('button', { name: 'Start Claude' }).click({ timeout: 10_000 });
  await drawer.locator('.xterm-rows').waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => (document.querySelector('.xterm-rows')?.textContent ?? '').trim().length > 0);
  await drawer.getByRole('button', { name: 'Stop' }).click();
  assert.deepEqual(errors, []);
  assert.doesNotMatch(viteLog, /error/i, viteLog);
  await page.close();
});
