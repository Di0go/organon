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
// In the canary the browser tests must run: a missing Chromium is a failure there, not a skip.
if (!CHROMIUM && process.env.ORGANON_REQUIRE_CHROMIUM) throw new Error('No Chromium, and ORGANON_REQUIRE_CHROMIUM is set');

let app: Running;
let browser: Browser | undefined;

before(async () => {
  app = await start();
  if (CHROMIUM) browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
});

after(async () => {
  await browser?.close();
  void app.stop();
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

test("The core's hover card: pointing at something with a tip shows it", { skip: !CHROMIUM }, async () => {
  const page = await browser!.newPage();
  await page.goto(app.base);
  await page.getByTestId('filled').hover();
  const card = page.getByRole('tooltip');
  await card.waitFor();
  assert.match(await card.innerText(), /The accent\s+Filled with the accent/);
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
    void fresh.stop();
  }
});

test("The core's frame: the ribbon's places, a tab per page, the status line, all live over the core's stream", {
  skip: !CHROMIUM,
}, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${app.base}/#/notes`);
  await page.getByRole('navigation', { name: 'Places' }).getByRole('link', { name: 'Notes' }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Notes' }).getAttribute('aria-selected'), 'true');
  // A note added from outside the page (another tab, the agent) shows up without a reload.
  await page.locator('.statusline .st i.on').waitFor();
  const res = await fetch(`${app.base}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Bring the long rope' }),
  });
  assert.equal(res.status, 200);
  await page.getByRole('list', { name: 'Notes' }).getByText('Bring the long rope').waitFor();
  assert.match(await page.locator('.statusline').innerText(), /\d+ notes/);
  assert.equal(await page.locator('.chart svg').count(), 1);
  // Ctrl+K searches, Enter opens, and the page gets its own tab beside the others.
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Search' }).getByRole('textbox').fill('rope');
  await page.getByRole('option', { name: /Bring the long rope/ }).waitFor();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Bring the long rope' }).waitFor();
  assert.equal(await page.getByRole('tab').count(), 2);
  // Right-click on a note: the app's own item in the core's menu.
  await page.getByRole('list', { name: 'Notes' }).getByText('Bring the long rope').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open the note' }).waitFor();
  await page.keyboard.press('Escape');
  // Closing the open tab goes to its neighbour.
  await page.getByRole('tab', { selected: true }).hover();
  await page.getByRole('button', { name: /Close Bring the long rope/ }).click();
  await page.getByRole('tab', { name: 'Notes', selected: true }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('On a phone, the ribbon slides in from the menu button and closes on a place', { skip: !CHROMIUM }, async () => {
  const page = await browser!.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(app.base);
  const ribbon = page.locator('.ribbon-col');
  assert.ok((await ribbon.boundingBox())!.x < 0, 'hidden off the left edge');
  await page.getByRole('button', { name: 'Open the menu' }).click();
  await page.waitForFunction(() => document.querySelector('.ribbon-col')!.getBoundingClientRect().x >= 0);
  await page.getByRole('navigation', { name: 'Places' }).getByRole('link', { name: 'Notes' }).click();
  await page.waitForFunction(() => document.querySelector('.ribbon-col')!.getBoundingClientRect().x < 0);
  assert.equal(await page.evaluate(() => location.hash), '#/notes');
  await page.close();
});
