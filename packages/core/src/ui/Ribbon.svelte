<script lang="ts" module>
  /** A place on the ribbon: its icon (a 20×20 stroked path), its name under it, and whether the page is in it. */
  export interface Place {
    id: string;
    label: string;
    href: string;
    icon: string;
    on: boolean;
    /** A dot on the icon: something new there (`dot`), or something that needs him (`turn`, beating). */
    pip?: 'dot' | 'turn';
    pipTitle?: string;
    /** A number on the icon, when there is no pip (Aristotle: the concepts to review today); 0 shows nothing. */
    count?: number;
    countTitle?: string;
    title?: string;
  }
</script>

<script lang="ts">
  // The thin strip on the far left: the app's places, search, then (at the foot) what the app adds, focus and the
  // look. An app gives its places and, if it wants, more buttons after search (`after`) and at the foot (`foot`),
  // drawn with the same .rib class.
  //
  // From Galen's ui/src/lib/Ribbon.svelte, with the places and the badges the app's.
  import type { Snippet } from 'svelte';
  import { focus, searchBox } from './frame.svelte.ts';
  import LookPicker from './LookPicker.svelte';
  import type { Look } from './theme.svelte.ts';
  import { words } from './words.ts';

  let { places, look, after, foot }: { places: Place[]; look: Look; after?: Snippet; foot?: Snippet } = $props();

  /** The appearance popover is open. */
  let settings = $state(false);

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') settings = false;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<nav class="ribbon" aria-label={words.places}>
  {#each places as p (p.id)}
    <a class="rib" class:on={p.on} href={p.href} aria-current={p.on ? 'page' : undefined} title={p.title}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={p.icon} /></svg>
      <span class="lbl">{p.label}</span>
      {#if p.pip}<i class="pip" class:turn={p.pip === 'turn'} title={p.pipTitle}></i>{:else if p.count}<i class="count" title={p.countTitle}
          >{p.count}</i
        >{/if}
    </a>
  {/each}
  <button class="rib" class:on={searchBox.open} onclick={() => searchBox.toggle()} title={words.searchHint}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12.2 12.2l4.3 4.3" /></svg>
    <span class="lbl">{words.search}</span>
  </button>
  {@render after?.()}

  <span class="space"></span>

  {@render foot?.()}
  <button class="rib" onclick={() => focus.toggle(true)} title={words.focusHint}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7.5V4h3.5M12.5 4H16v3.5M16 12.5V16h-3.5M7.5 16H4v-3.5" /></svg>
    <span class="lbl">{words.focus}</span>
  </button>
  <div class="settings-wrap">
    <button
      class="rib"
      class:on={settings}
      onclick={() => (settings = !settings)}
      title={words.appearance}
      aria-label={words.appearance}
      aria-expanded={settings}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true"
        ><path d="M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 3.5v13" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" class="fill" /></svg
      >
    </button>
    {#if settings}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="veil" onclick={() => (settings = false)}></div>
      <div class="pop" role="dialog" aria-label={words.appearance}>
        <LookPicker {look} />
      </div>
    {/if}
  </div>
</nav>

<style>
  .ribbon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    padding: 10px 0;
    background: var(--b1);
    border-right: 1px solid var(--rule);
  }

  .space {
    flex: 1;
  }

  .ribbon :global(.rib) {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 46px;
    min-height: 44px;
    text-decoration: none;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--faint);
    cursor: pointer;
  }

  .ribbon :global(.rib:hover) {
    color: var(--fg);
    background: var(--hover);
    text-decoration: none;
  }

  .ribbon :global(.rib.on) {
    color: var(--acc);
    background: var(--acc-soft);
  }

  .ribbon :global(.lbl) {
    font-size: 0.64rem;
    line-height: 1;
    letter-spacing: 0.01em;
  }

  .ribbon :global(.rib svg) {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ribbon :global(.rib svg .fill) {
    fill: currentColor;
    stroke: none;
  }

  .ribbon :global(.pip) {
    position: absolute;
    top: 4px;
    right: 10px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--acc);
  }

  .ribbon :global(.count) {
    position: absolute;
    top: 2px;
    right: 6px;
    min-width: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--acc);
    color: var(--on-acc, #fff);
    font: 600 0.62rem/15px var(--sans);
    font-style: normal;
    text-align: center;
  }

  /* Something urgent: an alert he should see today. */
  .ribbon :global(.pip.turn) {
    background: var(--wrong);
    box-shadow: 0 0 0 2px var(--b1);
    animation: beat 1.8s var(--ease) infinite;
  }

  @keyframes beat {
    50% {
      transform: scale(1.35);
    }
  }

  .settings-wrap {
    position: relative;
  }

  .veil {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .pop {
    position: absolute;
    z-index: 50;
    left: 40px;
    bottom: 0;
    width: 210px;
    padding: 12px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
</style>
