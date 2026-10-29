// The app's real server on throwaway folders and a free port, through the core's test helpers, as Argus's tests do.

import assert from 'node:assert/strict';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { freePort, startServer } from '@organon/core/testing';

export { freePort };

export interface Running {
  base: string;
  dataDir: string;
  stateDir: string;
  stop(): Promise<void>;
}

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Starts server/index.ts; `stateDir` / `dataDir` to start it on folders made beforehand (a settings.json, a record),
 * `env` for more of its MINIMAL_* variables. Never a real Claude Code: a plain shell runs in the drawer, and `cat` answers the chat with what it was sent.
 */
export async function start(stateDir?: string, dataDir?: string, env: Record<string, string> = {}): Promise<Running> {
  return startServer(ROOT, {
    stateDir,
    dataDir,
    env: { CLAUDE_CMD: 'bash --norc --noprofile', ONESHOT_CMD: 'cat', TERMINAL_QUIET_MS: '300', ...env },
  });
}

export async function put(base: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/**
 * The core's Markdown on the home page, drawn whole: a table whose cells keep the "|" in their code and maths, KaTeX
 * with its styles, a Mermaid diagram, and a link to a note pointed into the app while an outside one is left alone.
 */
export async function checkMarkdown(page: Page): Promise<void> {
  const md = page.getByTestId('markdown');
  await md.locator('table .katex').waitFor({ timeout: 20_000 });
  await md.locator('.math-display .katex-display').waitFor();
  await md.locator('figure.diagram svg').waitFor({ timeout: 20_000 });
  const cells = await md.locator('table tbody td').evaluateAll((tds) => tds.map((td) => td.textContent?.trim() ?? ''));
  assert.equal(cells.length, 3, `one row of three cells, not split on a "|": ${JSON.stringify(cells)}`);
  assert.equal(cells[0], 'a|b');
  assert.equal(await md.locator('table td:nth-child(2) .katex annotation').textContent(), '|x|');
  assert.equal(await md.locator('table td:nth-child(3) span.term').getAttribute('data-def'), 'a bar that is not a border');
  // katex.css came through the core: KaTeX's MathML copy is there for readers, out of sight.
  const mathml = await md
    .locator('.katex-mathml')
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  assert.equal(mathml, 'absolute');
  assert.equal(await md.getByRole('link', { name: 'the first note' }).getAttribute('href'), '#/notes/0');
  assert.equal(await md.getByRole('link', { name: 'the site' }).getAttribute('href'), 'https://example.org');
}
