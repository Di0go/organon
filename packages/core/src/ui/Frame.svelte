<script lang="ts">
  // The frame every app's page sits in: the ribbon on the left (sliding in over the page on a small screen, under a
  // bar with the menu, the app's name and search), the tabs above the page, the page, and the status line along the
  // bottom. The app fills each part; shell.css draws them.
  //
  //   <Frame app="argus">
  //     {#snippet ribbon()}<Ribbon {places} look={theme} />{/snippet}
  //     {#snippet brand()}<Logo size={20} class="mobile-mark" />argus{/snippet}
  //     {#snippet tabbar()}<TabBar … />{/snippet}
  //     {#snippet status()}<StatusLine … />{/snippet}
  //     …the page…
  //   </Frame>
  //
  // From Galen's App.svelte, the shell without its pages.
  import type { Snippet } from 'svelte';
  import { focus, searchBox } from './frame.svelte.ts';
  import { words } from './words.ts';

  let {
    app,
    home = '#/',
    ribbon,
    brand,
    mobile,
    tabbar,
    status,
    children,
  }: {
    /** The app's name, lowercase: the key focus mode is remembered under ("argus.focus"). */
    app: string;
    /** Where the brand in the small screen's bar goes. */
    home?: string;
    ribbon: Snippet;
    /** The app's mark and name, in the small screen's bar. */
    brand: Snippet;
    /** More in the small screen's bar, before search (a badge that needs him). */
    mobile?: Snippet;
    tabbar?: Snippet;
    status?: Snippet;
    children: Snippet;
  } = $props();

  let railOpen = $state(false);

  // svelte-ignore state_referenced_locally
  focus.init(`${app}.focus`);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && railOpen) railOpen = false;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="ribbon-col" class:open={railOpen} onclick={(e) => (e.target as Element).closest('a') && (railOpen = false)}>
    {@render ribbon()}
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" class:open={railOpen} onclick={() => (railOpen = false)}></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="stage"
    onpointerenter={() => document.documentElement.classList.add('show-scroll')}
    onpointerleave={() => document.documentElement.classList.remove('show-scroll')}
  >
    <header class="mobile-bar">
      <button onclick={() => (railOpen = true)} aria-label={words.menu}>
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
      </button>
      <a class="mobile-brand" href={home}>{@render brand()}</a>
      {@render mobile?.()}
      <button class="mobile-search" onclick={() => searchBox.toggle(true)} aria-label={words.search}>
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7.5 3a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M10.8 10.8l4 4" /></svg>
      </button>
    </header>
    {@render tabbar?.()}
    <main class="page-area">
      {@render children()}
    </main>
  </div>
  <div class="status-col">{@render status?.()}</div>
</div>

{#if focus.on}
  <button class="ghost small focus-exit" onclick={() => focus.toggle(false)} title="Esc / F">{words.leaveFocus}</button>
{/if}
