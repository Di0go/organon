// Axes: rounded maxima and evenly spaced ticks, from 0 or around a range, and time ticks that fall on round moments.
//
// From Galen's ui/src/lib/charts/scale.ts (niceTicks, niceRange), with the days the charts' own `x` now (any number:
// a day's noon in ms, a second of a capture) and the labels the app's formatters.

/** A rounded maximum and evenly spaced ticks from 0, e.g. 0 / 5 / 10 / 15 / 20. */
export function niceTicks(max: number, count = 4): { max: number; ticks: number[] } {
  if (!(max > 0) || !Number.isFinite(max)) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const nice = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= nice + step / 1e6; v += step) ticks.push(round(v, step));
  return { max: nice, ticks };
}

/** Rounded bounds and evenly spaced ticks around a range that need not start at 0 (weight, a lab value). */
export function niceRange(min: number, max: number, count = 4): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(round(v, step));
  return { min: lo, max: hi, ticks };
}

/** Ticks over a span of time (ms) on round moments: every 10 s, 1 min, 5 min, 1 h…, about `count` of them. */
export function timeTicks(from: number, to: number, count = 5): number[] {
  const span = Math.max(1, to - from);
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map((s) => s * 1000);
  const step = steps.find((s) => span / s <= count) ?? steps.at(-1)!;
  // Round moments in local time (a minute, an hour on the clock).
  const offset = new Date(from).getTimezoneOffset() * 60_000;
  const first = Math.ceil((from - offset) / step) * step + offset;
  const out: number[] = [];
  for (let t = first; t <= to; t += step) out.push(t);
  return out;
}

/** How an x tick's label sits: inside the axis at either end, centred on its tick elsewhere. */
export function tickAnchor(x: number, from: number, to: number): 'start' | 'end' | 'middle' {
  if (x <= from) return 'start';
  if (x >= to) return 'end';
  return 'middle';
}

/** "YYYY-MM-DD" (local) to its noon in ms: a day as a chart's x. */
export function dayX(day: string): number {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

function round(v: number, step: number): number {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  return Number(v.toFixed(digits));
}
