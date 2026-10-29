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
import { checkMarkdown, type Running, start } from './helpers.ts';

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

test("The core's Markdown: a table that keeps its cells, maths, a diagram, links into the app, and the lightbox", {
  skip: !CHROMIUM,
}, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(app.base);
  await checkMarkdown(page);
  // A click on the diagram shows it large; Escape closes it.
  await page.getByTestId('markdown').locator('figure.diagram svg').click();
  await page.getByRole('dialog').locator('svg.lightbox-content').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  // The diagram is drawn again in the new look's colours when the look changes.
  const drawnIn = () => page.getByTestId('markdown').locator('figure.diagram').getAttribute('data-look');
  assert.equal(await drawnIn(), 'dark|violet');
  await page.getByRole('button', { name: 'Light' }).click();
  await page.waitForFunction(() => document.querySelector('figure.diagram')?.getAttribute('data-look') === 'light|violet');
  // The link to a note opens it in the app.
  await page.getByRole('link', { name: 'the first note' }).click();
  assert.equal(await page.evaluate(() => location.hash), '#/notes/0');
  assert.deepEqual(errors, []);
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
    assert.equal(await page.evaluate(token('--acc')), '#f15f7f');
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

test("The core's chat beside a page: a message goes with the page, the answer comes back over the live stream", {
  skip: !CHROMIUM,
}, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await fetch(`${app.base}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Oil the hinges' }),
  });
  await page.goto(`${app.base}/#/notes`);
  await page.getByRole('button', { name: '« Chat' }).click();
  const chat = page.getByRole('complementary', { name: 'Chat with Minimal' });
  await chat.getByText('Ask Minimal anything').waitFor();
  // Tag a note with @: it goes with the message, and shows as a chip.
  const box = chat.getByRole('textbox', { name: 'Message Minimal' });
  await box.fill('what about @Oil');
  await chat.getByRole('option', { name: /Oil the hinges/ }).click();
  await page.keyboard.type('please');
  await page.keyboard.press('Enter');
  // `cat` stands in for Claude Code: the answer is what it was sent, the page and the tag included.
  await chat.getByText(/Where they are: The notes/).waitFor();
  const answer = await chat.locator('.msg.theirs .answer').innerText();
  assert.match(answer, /On screen:\s+.*Oil the hinges/s);
  assert.match(answer, /Tagged:\s+Note \d+: Oil the hinges/);
  assert.match(answer, /Their message: what about @Oil the hinges please/);
  assert.equal(await chat.locator('.bubble .tag-chip').innerText(), '@Oil the hinges');
  // Kept: a reload finds the conversation where it was.
  await page.reload();
  await page.getByRole('complementary', { name: 'Chat with Minimal' }).locator('.msg.theirs').waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("The core's drawer: opened from the status line, the agent started, typed into, and its screen drawn", {
  skip: !CHROMIUM,
}, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(app.base);
  await page
    .locator('.statusline')
    .getByRole('button', { name: /Terminal/ })
    .click();
  const drawer = page.getByRole('region', { name: "Claude's drawer" });
  // The dev instance never starts the agent on its own: it waits for a click.
  await drawer.getByRole('button', { name: 'Start Claude' }).click();
  await drawer.getByText('Running in the Organon minimal folder').waitFor();
  await drawer.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('echo drawer-$((6*7)) $MINIMAL_DRAWER');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /drawer-42 1/.test(document.querySelector('.xterm-rows')?.textContent ?? ''));
  await drawer.getByRole('button', { name: 'Stop' }).click();
  await drawer.getByText('Not running').waitFor();
  await page.keyboard.press('Control+`');
  await page.waitForFunction(() => !document.querySelector('.drawer')?.classList.contains('open'));
  assert.deepEqual(errors, []);
  await page.close();
});

test("The core's Settings: who runs is chosen, the model API's section opens, saved through the core's routes, and the app's own section after it", {
  skip: !CHROMIUM,
}, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${app.base}/#/settings`);
  await page.getByRole('heading', { name: 'Who runs in the drawer' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'The model API' }).count(), 0);
  // The app's name in the core's words, and the app's own section after Save.
  await page.getByText("Minimal's own agent on any OpenAI-compatible API").waitFor();
  await page.getByRole('region', { name: 'The motto' }).waitFor();
  // Choosing the API opens its section; a provider fills in its usual address.
  await page.getByRole('radio', { name: /A model API/ }).check();
  await page.getByRole('heading', { name: 'The model API' }).waitFor();
  await page.getByLabel('Provider').selectOption('ollama');
  assert.equal(await page.getByLabel('Address').inputValue(), 'http://localhost:11434/v1');
  await page.getByLabel('Address').fill('http://127.0.0.1:9/v1');
  await page.getByLabel('Model', { exact: true }).fill('qwen3');
  await page.getByRole('button', { name: 'Save' }).click();
  // Saved, and the models asked of an API that isn't there: said, not hidden.
  await page.getByText(/^Saved, but could not list the models/).waitFor();
  const saved = JSON.parse(await readFile(path.join(app.stateDir, 'settings.json'), 'utf8')) as {
    tutor: string;
    api: { provider: string; model: string };
  };
  assert.equal(saved.tutor, 'api');
  assert.deepEqual([saved.api.provider, saved.api.model], ['ollama', 'qwen3']);
  // Back to Claude Code, for the tests after.
  await fetch(`${app.base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{"tutor":"claude-code"}',
  });
  assert.deepEqual(errors, []);
  await page.close();
});
