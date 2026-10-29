<script lang="ts">
  // The agent's drawer, docked at the bottom of every page: an agent's terminal (TerminalView), or the API agent's
  // conversation (TutorConversation), with what runs there and the controls that go with it. Shown once it has been
  // opened (`tutor.mounted`), toggled with tutor.toggle() (the app binds Ctrl+`).
  //
  //   {#if tutor.mounted}<TerminalDrawer app="galen" title="Galen" look={theme} markdown={renderMarkdown} />{/if}
  //
  // From Aristotle's and Galen's ui/src/lib/TerminalDrawer.svelte, the same but for its words (words.ts) and the key
  // its height is kept under (`<app>.drawer-height`; Aristotle's old "mind-gym" one through `legacyKeys`).
  import type { Snippet } from 'svelte';
  import { AGENTS } from '../shared/agents.ts';
  import TerminalView from './TerminalView.svelte';
  import type { Look } from './theme.svelte.ts';
  import { tutor } from './tutor.svelte.ts';
  import TutorConversation from './TutorConversation.svelte';
  import { words } from './words.ts';

  let {
    app,
    title: appTitle,
    look,
    markdown,
    settings = '#/settings',
    intro,
    legacyKeys = [],
  }: {
    /** The app's name, lowercase: the drawer's height is kept under "<app>.drawer-height". */
    app: string;
    /** The app's title: "Running in the Galen folder". */
    title: string;
    look: Look;
    /** The Markdown renderer for the API agent's replies: source to safe HTML, `final` false while it is written. */
    markdown: (source: string, final: boolean) => string;
    /** Where Settings is. */
    settings?: string;
    /** What the API agent's empty conversation says, instead of the core's words. */
    intro?: Snippet;
    /** Keys the height was kept under before, moved over on first read. */
    legacyKeys?: string[];
  } = $props();

  // svelte-ignore state_referenced_locally
  const HEIGHT_KEY = `${app}.drawer-height`;

  let height = $state(readHeight());

  /** "Claude Code", "Codex CLI"…, or the API agent. */
  const title = $derived(
    tutor.mode === 'api'
      ? words.drawerApi(tutor.name)
      : words.drawerTerminal(AGENTS.find((a) => a.id === tutor.engine)?.name ?? tutor.name),
  );
  const where = $derived(
    !tutor.connected
      ? words.connecting
      : tutor.problem
        ? tutor.problem
        : tutor.mode === 'api'
          ? words.onModel(shortModel(tutor.command))
          : tutor.running
            ? words.runningIn(appTitle)
            : words.notRunning,
  );

  /** A model as people name it: a local server's file path ("/opt/models/qwen3-32b.gguf") without its folder and suffix. */
  function shortModel(model: string): string {
    return model.replace(/^.*\//, '').replace(/\.gguf$/i, '') || words.aModelApi;
  }

  // Tell the page how much of the bottom the drawer covers, so nothing hides behind it.
  $effect(() => {
    document.documentElement.style.setProperty('--drawer-space', tutor.open ? `${height}px` : '0px');
  });

  function readHeight(): number {
    try {
      for (const old of legacyKeys) {
        const was = localStorage.getItem(old);
        if (was !== null && localStorage.getItem(HEIGHT_KEY) === null) localStorage.setItem(HEIGHT_KEY, was);
        localStorage.removeItem(old);
      }
      const saved = Number(localStorage.getItem(HEIGHT_KEY));
      if (saved >= 160) return saved;
    } catch {
      // Storage may be unavailable; the default is fine.
    }
    return Math.round(window.innerHeight * 0.42);
  }

  function saveHeight() {
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      // Not essential.
    }
  }

  /** Drag the top edge: between 160px and all but 120px of the window. Saved on release. */
  function startResize(e: PointerEvent) {
    const startY = e.clientY;
    const startH = height;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      height = Math.min(Math.max(startH + (startY - ev.clientY), 160), window.innerHeight - 120);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      saveHeight();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }
</script>

<section class="drawer" class:open={tutor.open} style:height="{height}px" aria-label={words.drawerLabel} aria-hidden={!tutor.open}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-grip" onpointerdown={startResize} title={words.dragToResize}></div>
  <header class="drawer-head">
    <span class="drawer-title"><i class="run-dot" class:on={tutor.running} class:off={Boolean(tutor.problem)}></i>{title}</span>
    <span class="muted drawer-state" title={tutor.command}>{where}</span>
    <div class="drawer-actions">
      {#if tutor.mode === 'api'}
        {#if tutor.entries.length && !tutor.busy}
          <button class="ghost small" onclick={() => tutor.clear()} title={words.newConversationHint}>{words.newConversation}</button>
        {/if}
      {:else if tutor.connected && !tutor.running && !tutor.problem}
        <button class="primary small" onclick={() => tutor.start()}>{words.startAgent(tutor.name)}</button>
        <button class="ghost small" onclick={() => tutor.start(true)} title={words.resumeLastHint}>{words.resumeLast}</button>
      {:else if tutor.running}
        <button class="ghost small" onclick={() => tutor.stop()} title={words.stopSession(tutor.name)}>{words.stop}</button>
      {/if}
      <a class="button ghost small" href={settings} onclick={() => tutor.toggle(false)} title={words.settingsHint}>{words.settings}</a>
      <button class="ghost small" onclick={() => tutor.toggle(false)} aria-label={words.hideDrawer} title={words.hideDrawerHint}
        >{words.hide}</button
      >
    </div>
  </header>
  {#if tutor.mode === 'api'}
    <TutorConversation {markdown} {settings} app={appTitle} {intro} />
  {:else}
    <TerminalView {look} />
  {/if}
</section>
