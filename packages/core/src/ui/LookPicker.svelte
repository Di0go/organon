<script lang="ts">
  // Light or dark, and the accent: the inside of the Appearance pop-up that both apps had, copied, in their ribbon.
  // The app places it (a pop-up, a settings page); the look is the app's one theme (createTheme).
  import { ACCENTS } from '../shared/accents.ts';
  import type { Look } from './theme.svelte.ts';
  import { words } from './words.ts';

  let { look }: { look: Look } = $props();
</script>

<p class="pop-h">{words.appearance}</p>
<div class="seg" role="group" aria-label={words.mode}>
  <button class:on={look.value === 'light'} onclick={() => look.set('light', look.accent)}>{words.light}</button>
  <button class:on={look.value === 'dark'} onclick={() => look.set('dark', look.accent)}>{words.dark}</button>
</div>
<p class="pop-h">{words.accent}</p>
<div class="swatches" role="group" aria-label={words.accent}>
  {#each ACCENTS as a (a.id)}
    <button
      class:on={look.accent === a.id}
      onclick={() => look.set(look.value, a.id)}
      title={words.accentNames[a.id] ?? a.label}
      aria-label={words.accentNames[a.id] ?? a.label}
      aria-pressed={look.accent === a.id}
    >
      <span style:background={a.swatch}></span>
    </button>
  {/each}
</div>

<style>
  .pop-h {
    margin: 0 0 8px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--muted);
  }

  .pop-h + .seg {
    margin-bottom: 14px;
  }

  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    background: var(--b2);
    border-radius: var(--radius);
  }

  .seg button {
    padding: 5px 0;
    border: 0;
    border-radius: 5px;
    background: none;
    font-size: 0.85rem;
    color: var(--muted);
    cursor: pointer;
  }

  .seg button.on {
    background: var(--b0);
    color: var(--fg);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }

  .swatches {
    display: flex;
    gap: 8px;
  }

  .swatches button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1.5px solid transparent;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .swatches button.on {
    border-color: var(--fg);
  }

  .swatches span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }
</style>
