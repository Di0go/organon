// The copies that can't import each other stay one: theme-boot.js (a classic script) and tokens.css name every accent
// in shared/accents.ts, each with its colour in both themes. This is the drift the two apps had (Galen's green missing
// from Aristotle), caught where it would start.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACCENTS } from '../src/shared/accents.ts';

const ids = ACCENTS.map((a) => a.id);

test("theme-boot.js knows exactly the core's accents", async () => {
  const boot = await readFile(new URL('../src/ui/theme-boot.js', import.meta.url), 'utf8');
  const list = /const accents = \[([^\]]*)\]/.exec(boot)?.[1] ?? '';
  assert.deepEqual([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort(), [...ids].sort());
});

test('tokens.css gives every accent its colour in light and in dark, and its --on-acc in dark', async () => {
  const css = await readFile(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
  for (const id of ids) {
    assert.match(css, new RegExp(`:root\\[data-accent='${id}'\\] \\{\\s*--acc: #[0-9a-f]{6};`), `light ${id}`);
    assert.match(
      css,
      new RegExp(`:root\\[data-theme='dark'\\]\\[data-accent='${id}'\\] \\{\\s*--acc: #[0-9a-f]{6};\\s*--on-acc: #[0-9a-f]{6};`),
      `dark ${id}`,
    );
  }
});

test('theme-boot.js paints from a legacy key when its own key is empty', async () => {
  const boot = await readFile(new URL('../src/ui/theme-boot.js', import.meta.url), 'utf8');
  const store = new Map([['mind-gym.look', '{"mode":"light","accent":"red"}']]);
  const root = { dataset: {} as Record<string, string> };
  const run = new Function('document', 'localStorage', boot);
  run(
    { documentElement: root, currentScript: { dataset: { key: 'aristotle.look', legacy: 'mind-gym.look', accent: 'blue' } } },
    {
      getItem: (k: string) => store.get(k) ?? null,
    },
  );
  assert.deepEqual(root.dataset, { theme: 'light', accent: 'red' });
});
