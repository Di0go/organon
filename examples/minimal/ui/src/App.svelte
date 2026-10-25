<script lang="ts">
  // One page: the app's own motto and notes (its domain), the core's look picker, and who runs the agent (the core's
  // settings), changed through the API as Settings does in the apps.
  import LookPicker from '@organon/core/ui/LookPicker.svelte';
  import { theme } from './theme.svelte.ts';

  type View = { tutor: string; agents: { id: string; name: string }[]; motto: string };

  let view = $state<View | null>(null);
  let problem = $state('');

  async function load() {
    view = (await (await fetch('/api/settings')).json()) as View;
  }

  async function change(patch: Record<string, unknown>) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const answer = (await res.json()) as View & { error?: string };
    problem = answer.error ?? '';
    if (res.ok) view = answer;
  }

  load();
</script>

<main class="page">
  <h1>{view?.motto || 'Organon'}</h1>
  <div class="pick"><LookPicker look={theme} /></div>
  <p class="filled" data-testid="filled">On the accent</p>
  {#if view}
    <p>
      <label
        >Who runs the agent
        <select value={view.tutor} onchange={(e) => change({ tutor: e.currentTarget.value })}>
          {#each view.agents as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          <option value="api">A model API</option>
        </select></label
      >
    </p>
    <p>
      <label>Motto <input value={view.motto} onchange={(e) => change({ motto: e.currentTarget.value })} /></label>
    </p>
  {/if}
  {#if problem}<p role="alert">{problem}</p>{/if}
</main>
