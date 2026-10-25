<script lang="ts" module>
  /** One line of the menu: what it says, the key it has elsewhere (or a word), and what it does. */
  export interface MenuItem {
    label: string;
    hint?: string;
    run: () => void;
    /** Why it can't be chosen now; shown greyed with this as its title. */
    disabled?: string;
  }
</script>

<script lang="ts">
  // The menu on right-click. On selected text: copy it, or search for it across the app. On something the app gives
  // a menu (`actions`: an entity's link, a row), the app's items for it. Elsewhere, in a text box or in the terminal,
  // or with Shift held, the browser's own menu opens instead.
  //
  //   <ContextMenu app="Argus" actions={(el) => el.closest('[data-tip-entity]') ? [...] : []} />
  //
  // From Galen's ui/src/lib/ContextMenu.svelte, with the app's own items through `actions`.
  import { onMount, tick } from 'svelte';
  import { searchBox } from './frame.svelte.ts';
  import { words } from './words.ts';

  let { app, actions }: { app: string; actions?: (target: Element) => MenuItem[] } = $props();

  const WIDTH = 220;
  /** Where the browser's menu is still wanted. */
  const NATIVE = 'input, textarea, select, [contenteditable], .xterm';

  let open = $state<{ x: number; y: number; label: string; items: MenuItem[] } | null>(null);
  let menu = $state<HTMLElement>();

  onMount(() => {
    const onMenu = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (e.shiftKey || target?.closest?.(NATIVE)) return;
      const sel = getSelection();
      const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
      const own = target && actions ? actions(target) : [];
      if (text && sel?.rangeCount) {
        e.preventDefault();
        void show(e.clientX, e.clientY, words.selectedText, [
          { label: words.copy, hint: 'Ctrl C', run: () => void copy(text) },
          { label: words.searchFor(app), hint: 'Ctrl K', run: () => searchBox.toggle(true, text) },
          ...own,
        ]);
      } else if (own.length) {
        e.preventDefault();
        void show(e.clientX, e.clientY, app, own);
      }
    };
    const away = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.context-menu')) close();
    };
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('pointerdown', away, true);
    addEventListener('scroll', close, { passive: true, capture: true });
    addEventListener('resize', close);
    addEventListener('blur', close);
    return () => {
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('pointerdown', away, true);
      removeEventListener('scroll', close, { capture: true });
      removeEventListener('resize', close);
      removeEventListener('blur', close);
    };
  });

  async function show(x: number, y: number, label: string, items: MenuItem[]) {
    open = { x, y, label, items };
    await tick();
    if (!menu) return;
    // Inside the window, flipped to the left or above when it would run off the edge.
    const r = menu.getBoundingClientRect();
    open.x = x + r.width > innerWidth - 8 ? Math.max(8, x - r.width) : x;
    open.y = y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  function close() {
    open = null;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard API on a plain http:// page: the old way still copies the selection.
      document.execCommand('copy');
    }
  }

  function choose(item: MenuItem) {
    if (item.disabled) return;
    close();
    item.run();
  }

  /** Arrows move between items, Escape closes, Enter and Space choose (as buttons do). */
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(menu?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
</script>

{#if open}
  <div
    class="context-menu"
    bind:this={menu}
    role="menu"
    tabindex="-1"
    aria-label={open.label}
    style:left="{open.x}px"
    style:top="{open.y}px"
    style:min-width="{WIDTH}px"
    onkeydown={onKey}
  >
    {#each open.items as item, i (i)}
      <button role="menuitem" disabled={Boolean(item.disabled)} title={item.disabled} onclick={() => choose(item)}>
        <span class="label">{item.label}</span>
        {#if item.hint}<span class="hint">{item.hint}</span>{/if}
      </button>
    {/each}
    <p class="native">{words.nativeMenu}</p>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 70;
    padding: 4px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    font-size: 0.86rem;
    animation: pop 0.1s var(--ease);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }

  button {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    width: 100%;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--hover);
    outline: none;
  }

  button:disabled {
    color: var(--faint);
    cursor: default;
  }

  .hint {
    font-size: 0.76rem;
    color: var(--faint);
  }

  .native {
    margin: 4px 0 0;
    padding: 6px 10px 4px;
    border-top: 1px solid var(--rule);
    font-size: 0.72rem;
    color: var(--faint);
  }
</style>
