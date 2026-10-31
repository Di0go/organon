<script lang="ts" module>
  /** Something that can be tagged with @: its label in the text, its kind and a hint in the list, and what it stands for. */
  export interface Mention {
    label: string;
    /** "Day", "Marker"… */
    kind: string;
    hint: string;
    /** Sent with the message: the record it stands for, as text. */
    context: () => string;
  }
</script>

<script lang="ts">
  // The chat beside a page: talk with the app about what is on screen. Each message goes with where the person is and
  // the page as text, plus whatever they tag with @, so they never have to explain; the answer streams in as it is
  // written and can be stopped. One conversation per place: it stays there (leave and come back, it is there), and it
  // can be cleared to start over.
  //
  //   <ChatPanel {chats} thread="today" title="Home" name="Galen" markdown={renderMarkdown} mentions={() => …}>
  //     {#snippet avatar(size)}<Logo {size} />{/snippet}
  //   </ChatPanel>
  //
  // From Galen's ui/src/lib/ChatPanel.svelte. The app's: who answers (`name`, `avatar`), the Markdown renderer
  // (`markdown`: source to safe HTML, `final` false while it is being written), what can be tagged (`mentions`),
  // where in the page the person is (`step`), and the chats themselves (`chats`, its feed's ChatStore).
  import { type Snippet, tick } from 'svelte';
  import type { ChatStore } from './chats.svelte.ts';
  import { drafts } from './drafts.ts';
  import { formatTime } from './format.ts';
  import { words } from './words.ts';

  let {
    chats,
    thread,
    title,
    where: whereNow,
    placeholder,
    page,
    step,
    name,
    avatar,
    markdown,
    mentions: mentionList,
  }: {
    chats: ChatStore;
    /** The conversation: one per place ("today", "training", "day-2026-10-18"). */
    thread: string;
    /** What the page is, in words ("Home", "The day 2026-10-18"). */
    title: string;
    /** Where the person is, in words, sent with each message when it says more than the title (Aristotle: "The class · Step 3: …"). */
    where?: () => string;
    /** The message box's hint, when the app's says more than "Ask about <title>…" (Aristotle: the step being read). */
    placeholder?: string;
    /** The page as text, sent with each message so the chat sees what the person sees. */
    page?: () => string;
    /** Where in the page they are (Aristotle's step), sent with each message. */
    step?: () => string | undefined;
    /** Who answers: the app's name. */
    name: string;
    /** The app's mark, at a size in pixels; its first letter otherwise. */
    avatar?: Snippet<[number]>;
    markdown: (source: string, final: boolean) => string;
    /** Everything that can be tagged with @; without it, nothing can. */
    mentions?: () => Mention[];
  } = $props();

  const MAX_PAGE = 9000;

  let text = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let confirmClear = $state(false);
  let list = $state<HTMLElement>();
  let box = $state<HTMLTextAreaElement>();
  /** What has been tagged in the message being written. */
  let tagged = $state<Mention[]>([]);
  /** The @ being typed: where it starts in the text, and what follows it so far. */
  let picking = $state<{ at: number; query: string } | null>(null);
  let picked = $state(0);

  const messages = $derived(chats.messages[thread] ?? null);
  const draft = $derived(chats.drafts[thread] ?? null);
  /**
   * The answer being written, as blocks split at blank lines (outside code fences and $$ maths, and not before an
   * indented line that continues a list). Each block is rendered on its own, so as text streams in only the last one
   * is rendered again, not the whole answer.
   */
  const draftBlocks = $derived.by(() => {
    if (!draft) return [];
    const out: string[] = [];
    let cur = '';
    let fence = false;
    let math = false;
    let gap = false;
    for (const line of draft.text.split('\n')) {
      const blank = line.trim() === '';
      if (!fence && !math && blank) {
        if (cur.trim()) gap = true;
        else cur = '';
        continue;
      }
      if (gap) {
        if (/^\s/.test(line)) cur += '\n';
        else {
          out.push(cur);
          cur = '';
        }
        gap = false;
      }
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      else if (!fence && (line.match(/\$\$/g)?.length ?? 0) % 2 === 1) math = !math;
      cur += `${line}\n`;
    }
    if (cur.trim()) out.push(cur);
    return out;
  });
  /** He is reading the newest messages (scrolled to the bottom), so new text keeps them in view. */
  let following = true;
  let scrollQueued = false;
  const where = $derived(whereNow?.() ?? title);
  /** Everything that can be tagged, as the app says. */
  const mentionables = $derived(mentionList?.() ?? []);
  const options = $derived.by(() => {
    if (!picking) return [];
    const q = picking.query.toLowerCase();
    return mentionables.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 8);
  });

  $effect(() => {
    void chats.load(thread);
  });

  /** The conversation the box's text belongs to: what is not sent yet is kept per conversation, for coming back. */
  let draftFor = '';
  $effect.pre(() => {
    if (thread === draftFor) return;
    draftFor = thread;
    text = drafts.get(`chat:${thread}`, '');
  });
  $effect(() => drafts.text(`chat:${draftFor}`, text));

  // Keep the newest message in view as the conversation grows and an answer streams in, unless they have scrolled up
  // to reread: at most once a frame, however fast the text arrives.
  $effect(() => {
    void messages?.length;
    void draft?.text;
    if (sending) following = true;
    if (!following || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (list) list.scrollTop = list.scrollHeight;
    });
  });

  /** Following the conversation while near its end; scrolling up to reread stops it. */
  function onScroll() {
    if (!list) return;
    following = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  // The box grows with what is written, up to a few lines.
  $effect(() => {
    void text;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 200)}px`;
  });

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    sending = true;
    error = null;
    const mentions = tagged.filter((m) => body.includes(`@${m.label}`));
    text = '';
    tagged = [];
    picking = null;
    try {
      const res = await fetch(chats.url(thread), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          where,
          page: page ? clip(page()) : undefined,
          step: step?.(),
          mentions: mentions.map((m) => m.context()).join('\n\n') || undefined,
          tags: mentions.map((m) => `@${m.label}`),
        }),
      });
      if (!res.ok) {
        error = ((await res.json()) as { error?: string }).error ?? words.couldNotAnswer(name);
        text = body;
      }
    } catch {
      error = words.unreachable(name);
      text = body;
    }
    sending = false;
  }

  /** Stops the answer being written; what it said so far stays. */
  function stop() {
    void fetch(`${chats.url(thread)}/answer`, { method: 'DELETE' });
  }

  async function clear() {
    confirmClear = false;
    await fetch(chats.url(thread), { method: 'DELETE' });
  }

  function onKey(e: KeyboardEvent) {
    if (picking && options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        picked = (picked + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const option = options[picked];
        if (option) choose(option);
        return;
      }
    }
    if (e.key === 'Escape' && picking) {
      e.preventDefault();
      picking = null;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  /** Watches for an @ being typed: from it to the caret is what is looked for. */
  function onInput() {
    if (!mentionList) return;
    const caret = box?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    const q = at === -1 ? '' : before.slice(at + 1);
    const starts = at !== -1 && (at === 0 || /\s/.test(before[at - 1] ?? ''));
    picking = starts && !q.includes('\n') && q.length <= 40 ? { at, query: q } : null;
    picked = 0;
  }

  /** Puts the tag in the text, where the @ was, and remembers what it stands for. */
  function choose(m: Mention) {
    if (!picking) return;
    const caret = picking.at + 1 + picking.query.length;
    text = `${text.slice(0, picking.at)}@${m.label} ${text.slice(caret)}`;
    if (!tagged.some((t) => t.label === m.label)) tagged = [...tagged, m];
    const pos = picking.at + m.label.length + 2;
    picking = null;
    void tick().then(() => {
      box?.focus();
      box?.setSelectionRange(pos, pos);
    });
  }

  /** Opens the tag list from the @ button. */
  function startTag() {
    const add = text && !/\s$/.test(text) ? ' @' : '@';
    text += add;
    void tick().then(() => {
      box?.focus();
      box?.setSelectionRange(text.length, text.length);
      onInput();
    });
  }

  /** A message of theirs with what they tagged shown as chips. */
  function withChips(t: string, mentions: string[] = []): string {
    let html = t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    for (const m of [...mentions].sort((a, b) => b.length - a.length)) {
      const safe = m.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
      html = html.split(safe).join(`<span class="tag-chip">${safe}</span>`);
    }
    return html;
  }

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      // Not on plain http; nothing else to do.
    }
  }

  /** The page's text, cut to what the chat can take with each message. */
  function clip(t: string): string {
    return t.length > MAX_PAGE ? `${t.slice(0, MAX_PAGE)}\n…` : t;
  }
</script>

{#snippet mark(size: number)}
  {#if avatar}{@render avatar(size)}{:else}<span class="initial" style:font-size="{Math.round(size * 0.8)}px">{name.slice(0, 1)}</span>{/if}
{/snippet}

<div class="chat">
  <header class="chat-head">
    <span class="avatar" aria-hidden="true">{@render mark(16)}</span>
    <div class="who">
      <span class="name">{name}</span>
      <span class="sub">{words.chatAbout(title)}</span>
    </div>
    {#if messages?.length}
      {#if confirmClear}
        <span class="confirm">
          {words.clearChat}
          <button class="link danger" onclick={clear}>{words.clear}</button>
          <button class="link" onclick={() => (confirmClear = false)}>{words.keep}</button>
        </span>
      {:else}
        <button class="link quiet" onclick={() => (confirmClear = true)} title={words.clearHint}>{words.clear}</button>
      {/if}
    {/if}
  </header>

  <div class="msgs" bind:this={list} onscroll={onScroll}>
    {#if messages === null}
      <p class="hint">{words.loading}</p>
    {:else if messages.length === 0 && !draft && !sending}
      <div class="empty">
        <span class="big-avatar" aria-hidden="true">{@render mark(26)}</span>
        <p class="empty-t">{words.askAnything(name)}</p>
        <p class="hint">
          {words.chatEmptyHint}{#if mentionList}; {words.chatTagHint} <kbd>@</kbd>{/if}.
        </p>
      </div>
    {/if}

    {#each messages ?? [] as m (m.id)}
      {#if m.role === 'user'}
        <div class="msg mine">
          <p class="bubble">{@html withChips(m.text, m.mentions)}</p>
        </div>
      {:else}
        <div class="msg theirs">
          <span class="avatar" aria-hidden="true">{@render mark(14)}</span>
          <div class="body">
            <div class="answer md-box">{@html markdown(m.text, true)}</div>
            <div class="meta">
              <span>{formatTime(m.at)}</span>
              {#if m.stopped}<span class="stopped">{words.stopped}</span>{/if}
              <button class="link quiet" onclick={() => void copy(m.text)}>{words.copy}</button>
            </div>
          </div>
        </div>
      {/if}
    {/each}

    {#if draft}
      <div class="msg theirs">
        <span class="avatar" aria-hidden="true">{@render mark(14)}</span>
        <div class="body">
          <div class="answer streaming md-box">
            {#each draftBlocks as block, i (i)}{@html markdown(block, false)}{/each}
          </div>
        </div>
      </div>
    {:else if sending}
      <div class="msg theirs">
        <span class="avatar" aria-hidden="true">{@render mark(14)}</span>
        <div class="body"><span class="typing" aria-label={words.thinking(name)}><i></i><i></i><i></i></span></div>
      </div>
    {/if}
  </div>

  <div class="compose">
    {#if picking && options.length}
      <ul class="picker" role="listbox" aria-label={words.tagSomething}>
        {#each options as o, i (o.kind + o.label)}
          <li role="option" aria-selected={i === picked}>
            <button class:on={i === picked} onmousedown={(e) => e.preventDefault()} onclick={() => choose(o)}>
              <span class="k">{o.kind}</span><span class="l">{o.label}</span><span class="h">{o.hint}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if error}<p class="err">{error}</p>{/if}
    <div class="box">
      {#if mentionList}
        <button class="tool" onclick={startTag} title={words.tagHint} aria-label={words.tagHint}>@</button>
      {/if}
      <textarea
        bind:this={box}
        bind:value={text}
        oninput={onInput}
        onkeydown={onKey}
        rows="1"
        placeholder={placeholder ?? words.askAbout(title)}
        aria-label={words.messageName(name)}></textarea>
      {#if sending}
        <button class="send stop" onclick={stop} title={words.stopAnswer} aria-label={words.stopAnswer}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5" /></svg>
        </button>
      {:else}
        <button class="send" onclick={() => void send()} disabled={!text.trim()} title={words.sendHint} aria-label={words.send}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5V3.5M4.25 7.25L8 3.5l3.75 3.75" /></svg>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .chat-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }

  .initial {
    font-weight: 600;
    line-height: 1;
  }

  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--b0);
    border: 1px solid var(--rule);
    color: var(--acc);
  }

  .who {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }

  .name {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--fg);
  }

  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.74rem;
    color: var(--faint);
  }

  .quiet {
    font-size: 0.76rem;
    color: var(--faint);
  }

  .quiet:hover {
    color: var(--fg);
    text-decoration: none;
  }

  .confirm {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.76rem;
    color: var(--muted);
  }

  .confirm .link {
    font-size: inherit;
  }

  .danger {
    color: var(--wrong);
  }

  .msgs {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 16px 2px 14px;
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    margin: auto 0;
    padding: 0 10px;
    text-align: center;
  }

  .big-avatar {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--acc-soft);
    color: var(--acc);
    margin-bottom: 4px;
  }

  .empty-t {
    margin: 0;
    font-weight: 600;
    color: var(--fg);
  }

  .hint {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--faint);
  }

  .msg.mine {
    align-self: flex-end;
    max-width: 90%;
  }

  .bubble {
    margin: 0;
    padding: 9px 13px;
    border-radius: 16px 16px 4px 16px;
    background: var(--acc);
    color: var(--on-acc);
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bubble :global(.tag-chip) {
    padding: 0 5px;
    border-radius: 5px;
    background: rgb(255 255 255 / 0.22);
    font-weight: 600;
  }

  .msg.theirs {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .msg.theirs .avatar {
    width: 24px;
    height: 24px;
    margin-top: 1px;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .answer {
    color: var(--fg-2);
    font-size: 0.9rem;
    line-height: 1.65;
    overflow-wrap: anywhere;
  }

  .answer :global(p) {
    margin: 0 0 8px;
  }

  .answer :global(p:last-child) {
    margin-bottom: 0;
  }

  .answer :global(strong) {
    color: var(--fg);
  }

  .answer :global(ul),
  .answer :global(ol) {
    margin: 0 0 8px;
    padding-left: 1.2em;
  }

  .answer.streaming > :global(*:last-child)::after {
    content: '';
    display: inline-block;
    width: 7px;
    height: 0.95em;
    margin-left: 2px;
    vertical-align: -0.1em;
    background: var(--acc);
    animation: blink 1s steps(2) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .meta {
    display: flex;
    gap: 10px;
    margin-top: 4px;
    font-size: 0.72rem;
    color: var(--faint);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .msg.theirs:hover .meta,
  .meta:has(.stopped) {
    opacity: 1;
  }

  .meta .link {
    font-size: inherit;
  }

  .stopped {
    color: var(--shaky);
  }

  .typing {
    display: inline-flex;
    gap: 4px;
    padding: 9px 0;
  }

  .typing i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
    animation: bounce 1.2s ease-in-out infinite;
  }

  .typing i:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing i:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes bounce {
    0%,
    60%,
    100% {
      transform: none;
      opacity: 0.4;
    }

    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .compose {
    position: relative;
    padding-top: 8px;
  }

  /* One calm row: @ on the left, the text in the middle, send on the right, all on the first line's centre as the
     box grows. Send is a round button in the text colour that keeps its place and shape: faint until there is
     something to send, solid when there is; Stop takes its place while the answer is written. */
  .box {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 5px;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--b0);
    transition: border-color 0.15s;
  }

  .box:focus-within {
    border-color: var(--acc-line);
  }

  textarea {
    flex: 1;
    min-width: 0;
    display: block;
    resize: none;
    padding: 6px 4px;
    border: 0;
    background: none;
    color: var(--fg);
    font: 0.92rem / 1.5 var(--sans);
  }

  textarea::placeholder {
    color: var(--faint);
  }

  textarea:focus {
    outline: none;
  }

  .tool,
  .send {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-bottom: 2px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }

  .tool {
    background: none;
    color: var(--faint);
    font: 500 0.95rem var(--sans);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .tool:hover {
    background: var(--hover);
    color: var(--fg);
  }

  .send {
    background: var(--fg);
    color: var(--b0);
    transition:
      opacity 0.15s,
      transform 0.1s;
  }

  .send:disabled {
    opacity: 0.18;
    cursor: default;
  }

  .send:not(:disabled):hover {
    opacity: 0.85;
  }

  .send:not(:disabled):active {
    transform: scale(0.92);
  }

  .send svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .send.stop svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
    stroke: none;
  }

  .picker {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% - 4px);
    z-index: 5;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: 12px;
    box-shadow: var(--shadow);
  }

  .picker button {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--fg);
    font: 0.85rem var(--sans);
    text-align: left;
    cursor: pointer;
  }

  .picker button.on {
    background: var(--acc-soft);
  }

  .picker .k {
    flex: none;
    width: 3.8rem;
    font-size: 0.7rem;
    color: var(--faint);
  }

  .picker .l {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker .h {
    flex: none;
    font-size: 0.72rem;
    color: var(--faint);
  }

  .err {
    margin: 0 0 6px;
    font-size: 0.8rem;
    color: var(--wrong);
  }
</style>
