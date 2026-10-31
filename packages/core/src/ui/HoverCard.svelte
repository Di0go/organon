<script lang="ts">
  // One hover card for the whole app. Point at (or focus) anything carrying data-tip (and data-tip-title), and a small
  // card says what it is, a paragraph per blank line, as wide as it needs up to a limit. Anything carrying
  // data-tip-entity="kind:id" (an entity's link or chip) gets that entity's card instead, drawn by the app's `entity`
  // snippet. Delegated listeners on the document, so anything rendered anywhere, at any time, gets a card.
  //
  //   <HoverCard>{#snippet entity(key)}<DeviceCard {key} />{/snippet}</HoverCard>   once, in App.svelte
  //
  // From Galen's HoverCard.svelte, with the person's card and the inline Markdown left to the app.
  import { onMount, type Snippet, tick } from 'svelte';

  let {
    entity,
    inline,
    targets = '',
    entityOf,
  }: {
    entity?: Snippet<[string]>;
    /** More of the app's own to point at, as a selector (Aristotle: concept links, glossed passages). */
    targets?: string;
    /** The entity key for one of those, drawn by `entity` (Aristotle: "concept:topic/id", "gloss:id"); none, no card. */
    entityOf?: (el: HTMLElement) => string | undefined;
    /** Each paragraph as safe HTML (the core's renderInline from ui/markdown); plain text when not given. */
    inline?: (text: string) => string;
  } = $props();

  type Card = { title: string; paras: string[]; entity?: string };
  type Rect = { left: number; top: number; bottom: number; width: number };

  const WIDTH = 320;
  // A {{term|definition}} from the core's Markdown is a .term carrying its definition.
  // svelte-ignore state_referenced_locally
  const SELECTOR = ['.term[data-def], [data-tip], [data-tip-entity]', targets].filter(Boolean).join(', ');
  let box = $state<HTMLDivElement>();

  let card = $state<Card | null>(null);
  let pos = $state({ x: 0, y: 0, above: false });
  /** Where the pointer is, to put the card under the line it points at when a target wraps onto two. */
  let pointerY: number | undefined;
  /** The element the card is for. */
  let target: HTMLElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const over = (e: Event) => {
      pointerY = e instanceof PointerEvent ? e.clientY : undefined;
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el) show(el);
      else if (!(e.target as Element | null)?.closest?.('.hovercard')) hide();
    };
    // Moving onto the card itself, or straight onto another target, keeps it up.
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.('.hovercard') || to?.closest?.(SELECTOR)) return;
      if ((e.target as Element | null)?.closest?.(SELECTOR)) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide(false);
    };
    const leave = () => hide();
    const away = () => hide(false);
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', leave);
    document.addEventListener('keydown', key);
    addEventListener('scroll', away, { passive: true, capture: true });
    addEventListener('resize', away);
    return () => {
      removeEventListener('resize', away);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', leave);
      document.removeEventListener('keydown', key);
      removeEventListener('scroll', away, { capture: true });
    };
  });

  function build(el: HTMLElement): Card | null {
    if (el.matches('.term[data-def]')) return { title: el.textContent ?? '', paras: paras(el.dataset.def ?? '') };
    if (el.dataset.tipEntity && entity) return { title: '', paras: [], entity: el.dataset.tipEntity };
    const own = entity && entityOf?.(el);
    if (own) return { title: '', paras: [], entity: own };
    const tip = el.dataset.tip;
    if (!tip) return null;
    return { title: el.dataset.tipTitle ?? '', paras: paras(tip) };
  }

  /** A paragraph per blank line (or <br><br>, as a term's definition writes it). */
  function paras(source: string): string[] {
    return source
      .split(/\n\s*\n|<br>\s*<br>/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  /** The line of a (possibly wrapped) element nearest y, or its first line. */
  function lineRect(el: HTMLElement, y?: number): DOMRect {
    const lines = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const first = lines[0];
    if (!first) return el.getBoundingClientRect();
    if (y === undefined) return first;
    return lines.reduce((a, b) => (Math.abs(b.top + b.height / 2 - y) < Math.abs(a.top + a.height / 2 - y) ? b : a));
  }

  /** Centred under the rectangle and kept inside the window; above it when there is no room below. */
  function placeAt(r: Rect, width = WIDTH, height = 200) {
    const x = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), innerWidth - width - 12);
    const above = r.bottom + height + 16 > innerHeight && r.top > height + 16;
    return { x, y: above ? r.top - 8 : r.bottom + 8, above };
  }

  /** After a short pause, so sweeping the pointer across a page doesn't flash cards; quicker when one is up. */
  function show(el: HTMLElement) {
    clearTimeout(hideTimer);
    if (target === el && card) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(
      () => {
        const c = build(el);
        if (!c) return;
        target = el;
        card = c;
        const r = lineRect(el, pointerY);
        pos = placeAt(r);
        // Placed again once drawn, by its own size.
        void tick().then(() => {
          if (box && target === el) pos = placeAt(r, box.offsetWidth, box.offsetHeight);
        });
      },
      card ? 60 : 280,
    );
  }

  /** Soon rather than at once, so the pointer can cross the gap onto the card. */
  function hide(soon = true) {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(
      () => {
        card = null;
        target = null;
      },
      soon ? 160 : 0,
    );
  }
</script>

{#if card}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="hovercard"
    class:above={pos.above}
    class:entity={Boolean(card.entity)}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    style:max-width="{WIDTH}px"
    bind:this={box}
    role="tooltip"
    onpointerenter={() => clearTimeout(hideTimer)}
    onpointerleave={() => hide()}
  >
    {#if card.entity && entity}
      {@render entity(card.entity)}
    {:else}
      {#if card.title}<p class="hc-title">{card.title}</p>{/if}
      <div class="hc-body">
        {#each card.paras as p, i (i)}
          {#if inline}<p>{@html inline(p)}</p>{:else}<p>{p}</p>{/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .hovercard {
    position: fixed;
    z-index: 60;
    width: max-content;
    min-width: 160px;
    padding: 10px 14px 11px;
    background: var(--b0);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    font-size: 0.84rem;
    line-height: 1.5;
    text-wrap: pretty;
    animation: pop 0.14s var(--ease);
  }

  .hovercard.above {
    transform: translateY(-100%);
    animation-name: pop-up;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  @keyframes pop-up {
    from {
      opacity: 0;
      transform: translateY(calc(-100% + 3px));
    }
  }

  .hovercard.entity {
    width: 300px;
    padding: 14px 16px;
  }

  .hc-title {
    margin: 0 0 6px;
    padding-bottom: 6px;
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--fg);
    border-bottom: 1px solid var(--rule);
  }

  .hc-body {
    color: var(--fg-2);
  }

  .hc-body p {
    margin: 0;
  }

  .hc-body p + p {
    margin-top: 6px;
  }
</style>
