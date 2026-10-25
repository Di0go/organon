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

/** A token's value in a block of tokens.css, by the block's selector exactly as written. */
function token(css: string, selector: string, name: string): string | undefined {
  const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1]!.trim() === selector);
  for (const b of blocks.reverse()) {
    const v = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`).exec(b[2]!)?.[1];
    if (v) return v;
  }
  return undefined;
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => linear(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = rgb(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** The distance between two colours in Oklab: about 0.02 is just told apart side by side; 0.09 at a glance. */
function oklabDistance(a: string, b: string): number {
  const lab = (h: string) => {
    const [r, g, bl] = rgb(h);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
}

test('The red accent is told apart from the red that says a problem (--wrong), in light and in dark, and reads on its ground', async () => {
  // Red was #d1343c beside --wrong #c43c3c: a link and an error looked the same. Argus's default accent is red.
  const css = await readFile(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
  for (const [theme, acc, wrong, ground, onAcc] of [
    ['light', ":root[data-accent='red']", ":root[data-accent='red']", '#ffffff', ':root'],
    [
      'dark',
      ":root[data-theme='dark'][data-accent='red']",
      ":root[data-theme='dark'][data-accent='red']",
      '#1e1e1e',
      ":root[data-theme='dark'][data-accent='red']",
    ],
  ] as const) {
    const a = token(css, acc, '--acc')!;
    const w = token(css, wrong, '--wrong') ?? token(css, theme === 'light' ? ':root' : ":root[data-theme='dark']", '--wrong')!;
    const on = token(css, onAcc, '--on-acc')!;
    assert.ok(oklabDistance(a, w) >= 0.09, `${theme}: the accent ${a} and --wrong ${w} are ${oklabDistance(a, w).toFixed(3)} apart`);
    assert.ok(contrast(a, ground) >= 4.5, `${theme}: the accent ${a} on ${ground} is ${contrast(a, ground).toFixed(2)}:1`);
    assert.ok(contrast(on, a) >= 4.5, `${theme}: --on-acc ${on} on the accent ${a} is ${contrast(on, a).toFixed(2)}:1`);
    // --wrong under red still says a problem as plainly as it does under any other accent.
    assert.ok(contrast(w, ground) >= 4.5, `${theme}: --wrong ${w} on ${ground} is ${contrast(w, ground).toFixed(2)}:1`);
  }
});
