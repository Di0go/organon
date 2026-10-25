<script lang="ts">
  // The small bar along the bottom: what is going on, in a few words. On the left, the dev badge (the dev instance
  // says so, here and in the tab title, so it is never mistaken for the real one) and the first warning; then what the
  // app puts on the left (`left`) and on the right (`children`).
  //
  // From Galen's ui/src/lib/StatusLine.svelte, with the items the app's.
  import type { Snippet } from 'svelte';
  import { words } from './words.ts';

  let { warnings = [], left, children }: { warnings?: string[]; left?: Snippet; children?: Snippet } = $props();

  let dev = $state(false);

  fetch('/api/health')
    .then((r) => r.json())
    .then((h: { instance?: string }) => {
      dev = h.instance === 'dev';
      if (dev && !document.title.startsWith('[dev]')) document.title = `[dev] ${document.title}`;
    })
    .catch(() => {});
</script>

<footer class="statusline">
  <span class="left">
    {#if dev}<span class="dev" title={words.dev}>dev</span>{/if}
    {#if warnings.length}
      <!-- Something he should know (a backup failing, a file skipped): said quietly, but always in view. -->
      <span class="warn" role="status" title={warnings.join('\n')}
        ><i aria-hidden="true"></i><span class="warn-t">{warnings[0]}{warnings.length > 1 ? words.andMore(warnings.length - 1) : ''}</span
        ></span
      >
    {/if}
    {@render left?.()}
  </span>
  {@render children?.()}
</footer>

<style>
  .statusline {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    height: 26px;
    padding: 0 12px;
    background: var(--b1);
    border-top: 1px solid var(--rule);
    font-size: 0.75rem;
    color: var(--faint);
    white-space: nowrap;
  }

  .statusline :global(a) {
    color: inherit;
  }

  .statusline :global(a:hover) {
    color: var(--fg);
    text-decoration: none;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    margin-right: auto;
  }

  .warn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--shaky);
    cursor: default;
  }

  .warn-t {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .warn i {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--shaky);
  }

  .dev {
    padding: 0 6px;
    border-radius: 3px;
    background: var(--acc);
    color: var(--b0);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 18px;
  }

  /* A dot and a word: the app's way of saying a state (running, listening, asking). */
  .statusline :global(.st) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .statusline :global(.st i) {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
  }

  .statusline :global(.st i.on) {
    background: var(--solid);
  }

  .statusline :global(.st i.acc) {
    background: var(--acc);
  }

  .statusline :global(.st i.off) {
    background: var(--shaky);
  }

  @media (max-width: 640px) {
    .statusline {
      gap: 10px;
    }
  }
</style>
