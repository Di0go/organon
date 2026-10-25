<script lang="ts" module>
  /** One thing found: its kind (a key of `kinds`), what to show, and where it goes. */
  export interface SearchHit {
    kind: string;
    title: string;
    href: string;
    /** A quiet line under the title (where it is, what it is). */
    context?: string;
    /** The words around the match. */
    snippet?: string;
    /** An entity key ("device:aa:bb"), so the hit shows the entity's hover card. */
    entity?: string;
  }
</script>

<script lang="ts">
  // The search palette: Ctrl+K or / anywhere, the ribbon's search button, or "Search" on selected text. The app says
  // how to search (`search`: on the server, or over what the page already has) and what each kind is called. Arrows
  // move, Enter opens, Escape closes.
  //
  // From Galen's ui/src/lib/Search.svelte, with the search and the kinds the app's.
  import { searchBox } from './frame.svelte.ts';
  import { words } from './words.ts';

  let {
    search,
    kinds,
    placeholder = words.searchPlaceholder,
    empty = words.searchEmpty,
  }: {
    search: (q: string, signal: AbortSignal) => Promise<SearchHit[]> | SearchHit[];
    kinds: Record<string, string>;
    placeholder?: string;
    /** What the palette says before anything is typed. */
    empty?: string;
  } = $props();

  let q = $state('');
  let hits = $state<SearchHit[]>([]);
  let selected = $state(0);
  let loading = $state(false);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The search in flight: cancelled when he types on, so its answer never lands. */
  let inFlight: AbortController | null = null;

  // On opening, select what was typed last time, so typing replaces it. Text sent from elsewhere (the context menu)
  // replaces it instead.
  $effect(() => {
    if (!searchBox.open) return;
    if (searchBox.seed) {
      q = searchBox.seed;
      searchBox.seed = null;
    }
    queueMicrotask(() => input?.select());
  });

  // Search as he types, once he pauses for 120 ms.
  $effect(() => {
    const query = q.trim();
    clearTimeout(timer);
    inFlight?.abort();
    inFlight = null;
    if (!query) {
      hits = [];
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      const mine = new AbortController();
      inFlight = mine;
      try {
        const found = await search(query, mine.signal);
        if (mine.signal.aborted) return;
        hits = found;
        selected = 0;
      } catch {
        // Cancelled by a newer search, or the server is away: nothing to show for this one.
      } finally {
        if (inFlight === mine) {
          inFlight = null;
          loading = false;
        }
      }
    }, 120);
  });

  function close() {
    searchBox.toggle(false);
  }

  function go(h: SearchHit | undefined) {
    if (!h) return;
    location.hash = h.href;
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      list?.querySelector(`[data-i="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  /** Ctrl+K anywhere, or / when not typing in a field. */
  function onWindowKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable], .xterm') !== null;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchBox.toggle();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      searchBox.toggle(true);
    }
  }

  /** The words he typed, marked in a piece of text. Escaped first: the text comes from his data. */
  function mark(text: string): string {
    const escaped = text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const found = q
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return found.length ? escaped.replace(new RegExp(`(${found.join('|')})`, 'gi'), '<mark>$1</mark>') : escaped;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

{#if searchBox.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="veil" onclick={close}></div>
  <div class="palette" role="dialog" aria-label={words.search} aria-modal="true">
    <div class="field">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12.2 12.2l4.3 4.3" /></svg>
      <input
        bind:this={input}
        bind:value={q}
        onkeydown={onKey}
        {placeholder}
        aria-label={words.search}
        aria-controls="search-results"
        aria-activedescendant={hits.length ? `hit-${selected}` : undefined}
        autocomplete="off"
        spellcheck="false"
      />
      <kbd>Esc</kbd>
    </div>
    <div class="results" id="search-results" role="listbox" bind:this={list}>
      {#each hits as h, i (i)}
        <a
          id="hit-{i}"
          data-i={i}
          class="hit"
          class:on={i === selected}
          href={h.href}
          role="option"
          aria-selected={i === selected}
          onclick={(e) => {
            e.preventDefault();
            go(h);
          }}
          onpointermove={() => (selected = i)}
          data-tip-entity={h.entity}
        >
          <span class="kind">{kinds[h.kind] ?? h.kind}</span>
          <span class="body">
            <span class="title">{@html mark(h.title)}</span>
            {#if h.context}<span class="context">{h.context}</span>{/if}
            {#if h.snippet}<span class="snippet">{@html mark(h.snippet)}</span>{/if}
          </span>
        </a>
      {:else}
        <p class="none">
          {#if !q.trim()}{empty}{:else if loading}{words.searching}{:else}{words.nothingMatches(q.trim())}{/if}
        </p>
      {/each}
    </div>
    <footer>
      <span><kbd>↑</kbd><kbd>↓</kbd> {words.move}</span><span><kbd>Enter</kbd> {words.open}</span><span
        ><kbd>Ctrl</kbd><kbd>K</kbd> {words.or} <kbd>/</kbd> {words.search.toLowerCase()}</span
      >
    </footer>
  </div>
{/if}

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgb(0 0 0 / 0.28);
  }

  .palette {
    position: fixed;
    z-index: 81;
    top: 12vh;
    left: 50%;
    width: min(640px, calc(100vw - 32px));
    max-height: 72vh;
    display: flex;
    flex-direction: column;
    transform: translateX(-50%);
    background: var(--b0);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rule);
  }

  .field svg {
    flex: none;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .field input {
    flex: 1;
    min-width: 0;
    padding: 2px 0;
    border: 0;
    outline: none;
    background: none;
    font: 1rem var(--sans);
    color: var(--fg);
    box-shadow: none;
  }

  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
  }

  .hit {
    display: flex;
    gap: 12px;
    padding: 9px 10px;
    border-radius: var(--radius);
    color: var(--fg);
    text-decoration: none;
  }

  .hit.on {
    background: var(--acc-soft);
  }

  .kind {
    flex: none;
    width: 4.6rem;
    padding-top: 2px;
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--faint);
  }

  .hit.on .kind {
    color: var(--acc);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    font-weight: 550;
  }

  .context {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .snippet {
    font-size: 0.84rem;
    line-height: 1.5;
    color: var(--fg-2);
    overflow-wrap: anywhere;
  }

  .body :global(mark) {
    color: inherit;
    background: var(--hl);
    border-radius: 2px;
  }

  .none {
    margin: 0;
    padding: 18px 12px;
    font-size: 0.9rem;
    color: var(--muted);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    padding: 8px 14px;
    font-size: 0.76rem;
    color: var(--faint);
    border-top: 1px solid var(--rule);
  }

  footer kbd + kbd {
    margin-left: 2px;
  }

  @media (max-width: 640px) {
    .palette {
      top: 16px;
      max-height: calc(100vh - 32px);
    }

    footer {
      display: none;
    }
  }
</style>
