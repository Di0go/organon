// In a headless Chromium, on the built interface: the core's tokens are what the page is drawn with, the look picker
// changes the accent, and the choice survives a reload (theme-boot.js and theme.svelte.ts agree). Skipped where there
// is no Chromium (MINIMAL_TEST_CHROMIUM, the system's, or Playwright's own).

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { type Running, start } from './helpers.ts';

const CHROMIUM = [process.env.MINIMAL_TEST_CHROMIUM, '/usr/bin/chromium', chromium.executablePath()].find((p): p is string =>
  Boolean(p && existsSync(p)),
);

let app: Running;
let browser: Browser | undefined;

before(async () => {
  app = await start();
  if (CHROMIUM) browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
});

after(async () => {
  await browser?.close();
  app.stop();
});

const token = (name: string) => `getComputedStyle(document.documentElement).getPropertyValue('${name}').trim()`;

test("The page is drawn with the core's tokens, in the app's default accent, dark before the first paint", {
  skip: !CHROMIUM,
}, async () => {
  const page = await browser!.newPage();
  await page.goto(app.base);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'violet');
  assert.equal(await page.evaluate(token('--acc')), '#9a82ff');
  assert.equal(await page.evaluate(token('--page-w')), '1600px');
  // A filled accent carries the core's --on-acc for that accent in dark mode.
  const filled = await page.getByTestId('filled').evaluate((el) => getComputedStyle(el).color);
  assert.equal(filled, 'rgb(255, 255, 255)');
  await page.close();
});

test('The look picker changes the accent and the mode, and a reload keeps them', { skip: !CHROMIUM }, async () => {
  const page = await browser!.newPage();
  await page.goto(app.base);
  await page.getByRole('button', { name: 'Green' }).click();
  await page.getByRole('button', { name: 'Light' }).click();
  assert.equal(await page.evaluate(token('--acc')), '#2b8f55');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'green');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await page.getByRole('button', { name: 'Green' }).getAttribute('aria-pressed'), 'true');
  // Before the app's own script runs, theme-boot.js alone already paints the chosen look: same key, same ids.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'green');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.close();
});

test("The install's accent, set in settings.json, is the page's until the browser picks one", { skip: !CHROMIUM }, async () => {
  const state = await mkdtemp(path.join(tmpdir(), 'minimal-state-'));
  await writeFile(path.join(state, 'settings.json'), '{ "accent": "red" }');
  const fresh = await start(state);
  try {
    const page = await browser!.newPage();
    await page.goto(fresh.base);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'red');
    assert.equal(await page.evaluate(token('--acc')), '#f2636a');
    // Who runs the agent is changed through the core's settings, and the install's accent stays in the file.
    await page.getByRole('combobox').selectOption('codex');
    await page.waitForFunction(async () => (await (await fetch('/api/settings')).json()).tutor === 'codex');
    assert.deepEqual(JSON.parse(await readFile(path.join(state, 'settings.json'), 'utf8')), { accent: 'red', tutor: 'codex' });
    await page.close();
  } finally {
    fresh.stop();
  }
});
