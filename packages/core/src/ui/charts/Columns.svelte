<script lang="ts">
  // One value per row (a day, a minute) as columns from a single baseline, with an optional line across (an average to
  // compare against). Each column is its own hover target, wider than the mark.
  //
  // From Galen's ui/src/lib/charts/Columns.svelte, with the rows' labels the app's (they were days).
  import { niceTicks } from './scale.ts';

  let {
    points,
    label,
    color = 'var(--series-1)',
    unit = '',
    reference,
    detail,
    format,
    height = 200,
  }: {
    /** Each column: its key, the short label under it, the long one in the tooltip, its value. */
    points: { key: string; label: string; long?: string; value: number }[];
    label: string;
    color?: string;
    unit?: string;
    reference?: { value: number; label: string };
    /** A second line in the tooltip for a column ("2 sessions · 95 min"). */
    detail?: (key: string) => string;
    /** How a value reads; the number and the unit by default. */
    format?: (v: number) => string;
    height?: number;
  } = $props();

  const M = { top: 12, right: 52, bottom: 30, left: 40 };
  const plotH = $derived(height - M.top - M.bottom);
  const MAX_COL_W = 24;
  /** The surface gap between touching columns. */
  const GAP = 2;
  const LABEL_SPACE = 64;
  const TOOLTIP_W = 170;

  let width = $state(640);
  let active = $state<number | null>(null);

  const plotW = $derived(Math.max(120, width - M.left - M.right));
  const y = $derived(niceTicks(Math.max(...points.map((p) => p.value), reference?.value ?? 0, 1)));
  const bandW = $derived(plotW / Math.max(points.length, 1));
  const colW = $derived(Math.max(1, Math.min(MAX_COL_W, bandW * 0.7, bandW - GAP)));
  const every = $derived(Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / LABEL_SPACE)))));

  function py(v: number): number {
    return M.top + plotH - (v / y.max) * plotH;
  }

  /** A column with its 4px rounded top, square at the baseline. */
  function column(i: number): string {
    const v = points[i]?.value ?? 0;
    const x = M.left + i * bandW + (bandW - colW) / 2;
    const top = py(v);
    const base = py(0);
    const r = Math.min(4, colW / 2, base - top);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + colW - r} Q${x + colW},${top} ${x + colW},${top + r} V${base} Z`;
  }

  function onKey(e: KeyboardEvent) {
    const last = points.length - 1;
    if (e.key === 'ArrowRight') active = Math.min(last, (active ?? -1) + 1);
    else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? last + 1) - 1);
    else return;
    e.preventDefault();
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    {height}
    role="img"
    aria-label={label}
    tabindex="0"
    onfocus={() => (active = points.length - 1)}
    onblur={() => (active = null)}
    onkeydown={onKey}
    onpointerleave={() => (active = null)}
  >
    {#each y.ticks as t (t)}
      <line class="grid" x1={M.left} x2={M.left + plotW} y1={py(t)} y2={py(t)} />
      <text class="tick" x={M.left - 8} y={py(t)} text-anchor="end" dominant-baseline="central">{format ? format(t) : t}</text>
    {/each}
    {#each points as p, i (p.key)}
      {#if i % every === 0}
        <text class="tick" x={M.left + i * bandW + bandW / 2} y={height - 8} text-anchor="middle">{p.label}</text>
      {/if}
      <g class="column" class:active={active === i}>
        {#if p.value > 0}<path d={column(i)} fill={color} />{/if}
        <rect
          class="hit"
          x={M.left + i * bandW}
          y={M.top}
          width={bandW}
          height={plotH}
          role="presentation"
          onpointerenter={() => (active = i)}
        />
      </g>
    {/each}
    {#if reference}
      <line class="reference" x1={M.left} x2={M.left + plotW} y1={py(reference.value)} y2={py(reference.value)} />
      <text class="tick" x={M.left + plotW + 6} y={py(reference.value)} dominant-baseline="central">{reference.label}</text>
    {/if}
  </svg>
  {#if active !== null && points[active]}
    {@const p = points[active]!}
    <div class="tooltip" style:left="{Math.min(M.left + active * bandW, width - TOOLTIP_W)}px" style:top="{M.top}px">
      <span><strong>{format ? format(p.value) : `${p.value}${unit}`}</strong>{label}</span>
      {#if detail}<span class="muted">{detail(p.key)}</span>{/if}
      <span class="muted">{p.long ?? p.label}</span>
    </div>
  {/if}
</div>

<style>
  .reference {
    stroke: var(--line-strong);
    stroke-width: 1;
  }
</style>
