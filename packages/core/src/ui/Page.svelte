<script lang="ts">
  // A page with the chat beside it: the page's own content, and the app to talk to about it (the `chat` snippet, the
  // app's ChatPanel), folded away until it is opened. Whether it is open is remembered per browser; on a narrow screen
  // it slides over the page. Until the first load arrives (`loaded`) the page shows its shape, never an empty state
  // that is not true.
  //
  //   <Page app="galen" name="Galen" loaded={feed.loaded}>
  //     {#snippet chat()}<ChatPanel {chats} {thread} {title} {page} … />{/snippet}
  //     …the page…
  //   </Page>
  //
  // From Galen's ui/src/lib/Page.svelte; Aristotle has the same within its class page. The chat is the app's.
  import type { Snippet } from 'svelte';
  import { words } from './words.ts';

  let {
    app,
    name,
    loaded = true,
    wide = false,
    chat,
    children,
  }: {
    /** The app's name, lowercase: whether the chat is open is kept under "<app>.chat-open". */
    app: string;
    /** Who answers in the chat: the app's title. */
    name: string;
    /** The page's records have arrived; until then, its shape. */
    loaded?: boolean;
    /** A dashboard: the whole width and tighter margins, so it reads at a glance without scrolling. */
    wide?: boolean;
    /** The chat beside the page. */
    chat: Snippet;
    children: Snippet;
  } = $props();

  // svelte-ignore state_referenced_locally
  const KEY = `${app}.chat-open`;

  let open = $state(read());

  function toggle(value = !open) {
    open = value;
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      // Not essential.
    }
  }

  function read(): boolean {
    try {
      return localStorage.getItem(KEY) === '1' && innerWidth > 1180;
    } catch {
      return false;
    }
  }
</script>

<div class="with-chat" class:open>
  <div class="page" class:wide>
    {#if loaded}
      {@render children()}
    {:else}
      <div class="loading" aria-busy="true"><span class="sk w45 tall"></span><span class="sk w75"></span><span class="sk w45"></span></div>
    {/if}
  </div>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="side-scrim" onclick={() => toggle(false)}></div>
    <aside class="side" aria-label={words.chatWith(name)}>
      <div class="side-top">
        <button class="ghost small" onclick={() => toggle(false)} title={words.hideChatHint}>{words.hideChat}</button>
      </div>
      <div class="side-body">{@render chat()}</div>
    </aside>
  {:else}
    <button class="ghost small chat-open" onclick={() => toggle(true)} title={words.openChatHint(name)}>{words.openChat}</button>
  {/if}
</div>

<style>
  .with-chat {
    position: relative;
  }

  .loading {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 8px;
  }

  .side-top {
    display: flex;
    justify-content: flex-end;
    padding: 8px 10px 0;
  }

  .side-body {
    flex: 1;
    min-height: 0;
    padding: 4px 16px 14px;
  }

  /* A container, so a dashboard lays itself out by the width it has (the chat open beside it takes some), not the
     window's. */
  .page.wide {
    container: page / inline-size;
    max-width: none;
    padding: 18px clamp(16px, 2vw, 28px) 32px;
  }

  .chat-open {
    position: absolute;
    top: 14px;
    right: 18px;
  }
</style>
