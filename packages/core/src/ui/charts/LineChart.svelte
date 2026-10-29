<script lang="ts" module>
  export interface LineSeries {
    key: string;
    label: string;
    color: string;
    /** x is any number on the axis: a day's noon in ms (scale.ts dayX), a moment in ms. */
    points: { x: number; value: number }[];
    /** Draw the line through the points (default), the points as dots, or both. */
    mark?: 'line' | 'dots' | 'both';
    /** Shade under the line, down to the axis (a total, a rate). */
    area?: boolean;
  }
</script>

<script lang="ts">
  // Values along one axis: up to three series (each a line, dots or both, shaded under if asked), an optional
  // reference band (a lab's range, a target) and a reference line, with a crosshair that reads every series at the
  // point under the pointer. Arrow keys step through the points.
  //
  // From Galen's ui/src/lib/charts/LineChart.svelte, with x a number (it was a day) and its labels the app's.
  import { niceRange, niceTicks, tickAnchor } from './scale.ts';

  let {
    series,
    label,
    from,
    to,
    unit = '',
    band,
    reference,
    floor,
    zero = false,
    format = (v: number) => String(Math.round(v * 10) / 10),
    formatX,
    formatLong = formatX,
    ticks,
    height = 220,
    gap = Number.POSITIVE_INFINITY,
  }: {
    series: LineSeries[];
    label: string;
    /** The first and last x on the axis. */
    from: number;
    to: number;
    unit?: string;
    /** A shaded range (a lab's reference range, a target band). */
    band?: { low?: number; high?: number; label: string };
    /** A line across at one value (a target), labelled at its end. */
    reference?: { value: number; label: string };
    /** Keep the axis from going below this (0 for hours). */
    floor?: number;
    /** The axis starts at 0 (a rate, a count). */
    zero?: boolean;
    format?: (v: number) => string;
    /** An x as a tick label ("4 Oct", "14:05"). */
    formatX: (x: number) => string;
    /** An x in the tooltip ("Sun 4 Oct", "14:05:10"). */
    formatLong?: (x: number) => string;
    /** Where the x ticks go; five evenly spaced by default. */
    ticks?: number[];
    height?: number;
    /** A gap between points wider than this breaks the line: nothing was there in between. */
    gap?: number;
  } = $props();

  const M = { top: 16, right: 52, bottom: 30, left: 44 };
  const plotH = $derived(height - M.top - M.bottom);
  const TOOLTIP_W = 170;

  let width = $state(640);
  let active = $state<number | null>(null);

  const plotW = $derived(Math.max(120, width - M.left - M.right));
  const span = $derived(Math.max(1e-9, to - from));
  const values = $derived(series.flatMap((s) => s.points.map((p) => p.value)));
  const y = $derived.by(() => {
    const extra = [band?.low, band?.high, reference?.value].filter((v): v is number => v !== undefined);
    const all = [...values, ...extra];
    if (zero) {
      const t = niceTicks(Math.max(0, ...all));
      return { min: 0, max: t.max, ticks: t.ticks };
    }
    let lo = Math.min(...all);
    const hi = Math.max(...all);
    if (floor !== undefined) lo = Math.max(floor, lo);
    return niceRange(lo, hi);
  });
  /** Every x that has a value in any series, for the crosshair to snap to. */
  const xs = $derived([...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b));
  const xTicks = $derived(ticks ?? Array.from({ length: 5 }, (_, i) => from + (i * span) / 4));

  function px(x: number): number {
    return M.left + ((x - from) / span) * plotW;
  }

  function py(v: number): number {
    return M.top + plotH - ((v - y.min) / (y.max - y.min || 1)) * plotH;
  }

  /** The line through a series' points, broken where they go missing. */
  function path(points: { x: number; value: number }[]): string {
    let d = '';
    let prev: number | undefined;
    for (const p of points) {
      const jump = prev === undefined || p.x - prev > gap;
      d += `${jump ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.value).toFixed(1)}`;
      prev = p.x;
    }
    return d;
  }

  /** The shade under a line, a closed shape per unbroken run. */
  function areaPath(points: { x: number; value: number }[]): string {
    let d = '';
    let run: { x: number; value: number }[] = [];
    const close = () => {
      if (run.length > 1) {
        const base = py(Math.max(y.min, 0)).toFixed(1);
        d += `M${px(run[0]!.x).toFixed(1)},${base}`;
        for (const p of run) d += `L${px(p.x).toFixed(1)},${py(p.value).toFixed(1)}`;
        d += `L${px(run.at(-1)!.x).toFixed(1)},${base}Z`;
      }
      run = [];
    };
    for (const p of points) {
      if (run.length && p.x - run.at(-1)!.x > gap) close();
      run.push(p);
    }
    close();
    return d;
  }

  /** The x with a value closest to the pointer. */
  function nearest(clientX: number, rect: DOMRect): number | null {
    if (!xs.length) return null;
    const x = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(px(xs[i]!) - x) < Math.abs(px(xs[best]!) - x)) best = i;
    return best;
  }

  function onKey(e: KeyboardEvent) {
    const last = xs.length - 1;
    if (e.key === 'ArrowRight') active = Math.min(last, (active ?? -1) + 1);
    else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? last + 1) - 1);
    else return;
    e.preventDefault();
  }

  const activeX = $derived(active === null ? undefined : xs[active]);
  const lastOf = (s: LineSeries) => s.points.at(-1);
</script>

<div class="chart" bind:clientWidth={width}>
  {#if series.length > 1}
    <p class="chart-legend small muted">
      {#each series as s (s.key)}
        <span class="legend-item"><i class="key" class:dot={s.mark === 'dots'} style:background={s.color}></i>{s.label}</span>
      {/each}
    </p>
  {/if}
  <!-- Focusable so the arrow keys can step through the points; the table view carries every value too. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    {height}
    role="img"
    aria-label="{label}{series[0]?.points.length ? `: ${format(series[0].points.at(-1)?.value ?? 0)}${unit}` : ''}"
    tabindex="0"
    onpointermove={(e) => (active = nearest(e.clientX, (e.currentTarget as SVGSVGElement).getBoundingClientRect()))}
    onpointerleave={() => (active = null)}
    onfocus={() => (active = xs.length ? xs.length - 1 : null)}
    onblur={() => (active = null)}
    onkeydown={onKey}
  >
    {#if band}
      {@const top = py(band.high ?? y.max)}
      {@const bottom = py(band.low ?? y.min)}
      <rect class="band" x={M.left} y={top} width={plotW} height={Math.max(0, bottom - top)} />
    {/if}
    {#each y.ticks as t (t)}
      <line class="grid" x1={M.left} x2={M.left + plotW} y1={py(t)} y2={py(t)} />
      <text class="tick" x={M.left - 8} y={py(t)} text-anchor="end" dominant-baseline="central">{format(t)}</text>
    {/each}
    {#each xTicks as x (x)}
      <text
        class="tick"
        x={px(x)}
        y={height - 8}
        text-anchor={tickAnchor(x, from, to)}>{formatX(x)}</text
      >
    {/each}
    {#if reference}
      <line class="reference" x1={M.left} x2={M.left + plotW} y1={py(reference.value)} y2={py(reference.value)} />
      <text class="tick" x={M.left + plotW + 6} y={py(reference.value)} dominant-baseline="central">{reference.label}</text>
    {/if}
    {#each series as s (s.key)}
      {#if s.area}<path class="area" d={areaPath(s.points)} fill={s.color} />{/if}
      {#if s.mark !== 'dots'}
        <path d={path(s.points)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      {/if}
      {#if s.mark === 'dots' || s.mark === 'both'}
        {#each s.points as p (p.x)}
          <circle cx={px(p.x)} cy={py(p.value)} r="3.5" fill={s.color} class="ring" />
        {/each}
      {/if}
    {/each}
    {#if activeX !== undefined}
      <line class="crosshair" x1={px(activeX)} x2={px(activeX)} y1={M.top} y2={M.top + plotH} />
      {#each series as s (s.key)}
        {@const p = s.points.find((q) => q.x === activeX)}
        {#if p}<circle cx={px(p.x)} cy={py(p.value)} r="4.5" fill={s.color} class="ring" />{/if}
      {/each}
    {/if}
    {#each series.slice(0, 1) as s (s.key)}
      {@const p = lastOf(s)}
      {#if p && !reference}
        <circle cx={px(p.x)} cy={py(p.value)} r="4" fill={s.color} class="ring" />
        <text class="end-label" x={px(p.x) + 10} y={py(p.value)} dominant-baseline="central">{format(p.value)}{unit}</text>
      {/if}
    {/each}
  </svg>
  {#if activeX !== undefined}
    <div class="tooltip" style:left="{Math.max(0, Math.min(px(activeX), width - TOOLTIP_W))}px" style:top="{M.top}px">
      {#each series as s (s.key)}
        {@const p = s.points.find((q) => q.x === activeX)}
        {#if p}<span><strong>{format(p.value)}{unit}</strong><i class="key" style:background={s.color}></i>{s.label}</span>{/if}
      {/each}
      {#if band}<span class="muted">{band.label}</span>{/if}
      <span class="muted">{formatLong(activeX)}</span>
    </div>
  {/if}
</div>

<style>
  .band {
    fill: var(--b2);
  }

  .area {
    opacity: 0.14;
  }

  .reference {
    stroke: var(--line-strong);
    stroke-width: 1;
  }

  .legend-item + .legend-item {
    margin-left: 14px;
  }

  .key {
    display: inline-block;
    width: 12px;
    height: 2px;
    margin-right: 6px;
    vertical-align: 0.25em;
  }

  .key.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    vertical-align: 0;
  }
</style>
