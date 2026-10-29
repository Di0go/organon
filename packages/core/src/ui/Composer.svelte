<script lang="ts">
  // The message box at the foot of a page: the message goes to the agent running in the drawer (typed in), or to the
  // API agent. Above it, a bar when an agent waits on a question only its terminal can answer.
  //
  // From Aristotle's and Galen's ui/src/lib/Composer.svelte, the same but for comments and its words (words.ts).
  import { drafts } from './drafts.ts';
  import { tutor } from './tutor.svelte.ts';
  import { words } from './words.ts';

  let { settings = '#/settings' }: { settings?: string } = $props();

  /** What has not been sent yet, kept for coming back. */
  let text = $state(drafts.get('composer', ''));
  let box = $state<HTMLTextAreaElement>();

  $effect(() => drafts.text('composer', text));

  function send() {
    if (!text.trim()) return;
    tutor.say(text);
    text = '';
    resize();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  /** Grows the box with its text, up to a limit. Reset to auto first, or scrollHeight never shrinks. */
  function resize() {
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }

  /** Starts the agent in the drawer (resuming the last conversation, or a new one) and shows it. */
  function startAgent(resume: boolean) {
    tutor.start(resume);
    tutor.toggle(true);
  }
</script>

<div class="composer">
  {#if tutor.running}
    {#if tutor.asking}
      <button class="asking" onclick={() => tutor.toggle(true)}>{words.asking(tutor.name)}</button>
    {/if}
    <div class="composer-row">
      <textarea
        bind:this={box}
        bind:value={text}
        oninput={resize}
        onkeydown={onKey}
        rows="1"
        placeholder={words.messageTo(tutor.name)}
        aria-label={words.messageName(tutor.name)}></textarea>
      <button class="primary" onclick={send} disabled={!text.trim()}>{words.send}</button>
    </div>
  {:else if tutor.connected && tutor.problem}
    <p class="composer-off">{tutor.problem} <a href={settings}>{words.settings}</a></p>
  {:else if tutor.connected}
    <p class="composer-off">
      {words.notRunningHere(tutor.name)}
      <button class="link" onclick={() => startAgent(true)}>{words.resumeTheLast}</button>
      {words.or}
      <button class="link" onclick={() => startAgent(false)}>{words.startANewOne}</button>.
    </p>
  {/if}
</div>
