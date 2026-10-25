<script lang="ts">
  // The open pages, as tabs above the page: each with the app's icon and title for it, read at render so titles follow
  // the live data (a rename shows at once). A middle click closes a tab, as in a browser.
  //
  //   <TabBar {tabs} title={(key) => …} icon={(key) => …} />     the app says what each page's tab reads
  //
  // From Galen's ui/src/lib/TabBar.svelte, with the titles and icons the app's.
  import type { Tabs } from './tabs.svelte.ts';
  import { words } from './words.ts';

  let { tabs, title, icon }: { tabs: Tabs; title: (key: string) => string; icon: (key: string) => string } = $props();

  // The × sits inside the tab's link: without this, closing would also follow it.
  function closeTab(e: MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    tabs.close(key);
  }

  function onAux(e: MouseEvent, key: string) {
    if (e.button === 1) closeTab(e, key);
  }
</script>

<div class="tabbar" role="tablist" aria-label={words.openPages}>
  {#each tabs.list as key (key)}
    {@const t = title(key)}
    <a
      class="tab"
      class:on={key === tabs.active}
      href={key}
      role="tab"
      aria-selected={key === tabs.active}
      onauxclick={(e) => onAux(e, key)}
    >
      <svg class="i" viewBox="0 0 20 20" aria-hidden="true"><path d={icon(key)} /></svg>
      <span class="t">{t}</span>
      <button class="x" onclick={(e) => closeTab(e, key)} aria-label={words.close(t)} tabindex="-1">×</button>
    </a>
  {/each}
</div>

<style>
  /* Tabs sized to their titles, an icon for the kind of page, hairline separators between the quiet ones,
     and the open page lifted onto the page's own ground with an accent line on top. */
  .tabbar {
    display: flex;
    align-items: flex-end;
    min-height: 40px;
    padding: 0 8px;
    background: var(--b1);
    border-bottom: 1px solid var(--rule);
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
  }

  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 230px;
    height: 34px;
    margin-top: 6px;
    padding: 0 6px 0 12px;
    font-size: 0.8rem;
    color: var(--muted);
    border-radius: 8px 8px 0 0;
    text-decoration: none;
    transition:
      background-color 0.12s,
      color 0.12s;
  }

  /* A hairline between two quiet tabs; none next to the open one or under the pointer. */
  .tab + .tab::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 9px;
    bottom: 9px;
    border-left: 1px solid var(--rule-strong);
  }

  .tab.on::before,
  .tab.on + .tab::before,
  .tab:hover::before,
  .tab:hover + .tab::before {
    display: none;
  }

  .tab:hover {
    color: var(--fg);
    background: var(--hover);
    text-decoration: none;
  }

  /* The open tab: on the page's own ground, with the accent line on top (stopping short of the rounded corners). */
  .tab.on {
    color: var(--fg);
    font-weight: 500;
    background: var(--b0);
    background-image: linear-gradient(var(--acc), var(--acc));
    background-size: calc(100% - 16px) 2px;
    background-position: 8px 0;
    background-repeat: no-repeat;
    box-shadow: 0 0 0 1px var(--rule);
    clip-path: inset(-1px -1px 0 -1px);
  }

  /* The open tab runs into the page below it: a strip of the page's ground covers the bar's bottom border. */
  .tab.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 1px;
    background: var(--b0);
  }

  .tab.on .i {
    color: var(--acc);
  }

  .i {
    flex: none;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.9;
  }

  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--faint);
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }

  .tab:hover .x,
  .tab.on .x {
    opacity: 1;
  }

  /* Red on hover: closing is the one thing this button does. */
  .x:hover,
  .x:focus-visible {
    background: color-mix(in srgb, var(--wrong) 14%, transparent);
    color: var(--wrong);
    outline: none;
  }

  @media (max-width: 960px) {
    .tabbar {
      display: none;
    }
  }
</style>
