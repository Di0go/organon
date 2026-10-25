// The charts' axes (ui/charts/scale.ts) and the frame's words and formats (ui/words.ts, ui/format.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayX, niceRange, niceTicks, timeTicks } from '../src/ui/charts/scale.ts';
import { asDate, dayKey, formatDay, plural } from '../src/ui/format.ts';
import { EN, PT, setWords } from '../src/ui/words.ts';

test('niceTicks: a round maximum and even ticks from 0; nothing to show is 0 to 1', () => {
  assert.deepEqual(niceTicks(17), { max: 20, ticks: [0, 5, 10, 15, 20] });
  assert.deepEqual(niceTicks(0.37), { max: 0.4, ticks: [0, 0.1, 0.2, 0.3, 0.4] });
  assert.deepEqual(niceTicks(0), { max: 1, ticks: [0, 1] });
  assert.deepEqual(niceTicks(Number.NaN), { max: 1, ticks: [0, 1] });
  // Big rates (bytes a second) stay whole numbers.
  assert.deepEqual(niceTicks(3_400_000).ticks, [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000]);
});

test('niceRange: around a range that does not start at 0', () => {
  assert.deepEqual(niceRange(61.2, 64.9), { min: 61, max: 65, ticks: [61, 62, 63, 64, 65] });
  assert.equal(niceRange(5, 5).ticks.length > 1, true);
});

test('timeTicks: round moments on the clock, about as many as asked', () => {
  const from = new Date(2026, 9, 25, 14, 3, 17).getTime();
  const ticks = timeTicks(from, from + 10 * 60_000, 5);
  assert.ok(ticks.length >= 3 && ticks.length <= 6, String(ticks.length));
  for (const t of ticks) assert.equal(new Date(t).getSeconds(), 0);
  assert.ok(ticks.every((t, i) => i === 0 || t - ticks[i - 1]! === ticks[1]! - ticks[0]!));
});

test('A day is local noon, never the UTC midnight that is the day before west of Greenwich', () => {
  assert.equal(new Date(dayX('2026-03-01')).getDate(), 1);
  assert.equal(asDate('2026-03-01').getHours(), 12);
  assert.equal(dayKey(asDate('2026-03-01')), '2026-03-01');
});

test('Every word of the frame is in both languages, and the formats follow the language set', () => {
  assert.deepEqual(Object.keys(PT).sort(), Object.keys(EN).sort());
  setWords('pt');
  assert.equal(formatDay(dayKey(new Date())), 'Hoje');
  setWords('en');
  assert.equal(formatDay(dayKey(new Date())), 'Today');
  assert.equal(plural(1, 'day'), '1 day');
  assert.equal(plural(3, 'day'), '3 days');
});
