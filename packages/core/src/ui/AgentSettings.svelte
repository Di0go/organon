<script lang="ts" generics="V extends SettingsView">
  // Settings, who runs in the drawer: Claude Code by default; another agent CLI (Codex, Gemini CLI, opencode), reaching
  // the app over MCP; or the app's own agent on any OpenAI-compatible model API, hosted or local. Also what writes the
  // chat answers beside a page. Read and saved through the core's routes (server/settings-routes: /api/settings and
  // /api/settings/models); the API key goes in and never comes back out whole. The app's own sections come after the
  // Save button (`after`, with the view and `set` to lay the app's keys of a newer view over it).
  //
  // From Aristotle's and Galen's ui/src/pages/Settings.svelte, the same page but for their words.
  import type { Snippet } from 'svelte';
  import {
    type AgentId,
    AGENTS,
    type HelperEngine,
    type ModelInfo,
    PROVIDERS,
    type ProviderId,
    type SettingsBody,
    type SettingsView,
    type TutorEngine,
  } from '../shared/agents.ts';
  import { tutor } from './tutor.svelte.ts';
  import { words } from './words.ts';

  interface Props {
    /** The app's title, as the page says it ("Galen"). Its API key's variable is <NAME>_API_KEY. */
    name: string;
    /** The app's own sections, after Save. */
    after?: Snippet<[view: V, set: (patch: Partial<V>) => void]>;
  }

  let { name, after }: Props = $props();
  const keyVariable = $derived(`${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`);
  const agent = $derived(words.settingsAgent);

  let view = $state<V | null>(null);
  let loadError = $state('');
  // The form, as edited; saved together.
  let engine = $state<TutorEngine>('claude-code');
  let helpers = $state<HelperEngine>('claude-code');
  let provider = $state<ProviderId>('openrouter');
  let baseUrl = $state('');
  let apiKey = $state('');
  let removeKey = $state(false);
  let model = $state('');
  let helperModel = $state('');
  let vision = $state(false);

  let models = $state<ModelInfo[]>([]);
  let modelsNote = $state('');
  let saving = $state(false);
  let message = $state<{ ok: boolean; text: string } | null>(null);

  const usesApi = $derived(engine === 'api' || helpers === 'api');
  const preset = $derived(PROVIDERS.find((p) => p.id === provider));
  const chosen = $derived(models.find((m) => m.id === model));
  const dirty = $derived(
    view !== null &&
      (engine !== view.tutor ||
        helpers !== view.helpers ||
        provider !== view.api.provider ||
        baseUrl !== view.api.baseUrl ||
        apiKey !== '' ||
        removeKey ||
        model !== view.api.model ||
        helperModel !== view.api.helperModel ||
        vision !== view.api.vision),
  );

  /** The app's keys of a newer view, laid over this one without touching the form. */
  function set(patch: Partial<V>) {
    if (view) Object.assign(view, patch);
  }

  void load();

  async function load() {
    try {
      const res = await fetch('/api/settings');
      take((await res.json()) as V);
      if (view?.api.baseUrl) void loadModels();
    } catch {
      loadError = words.settingsCouldNotRead;
    }
  }

  /** The form, from what the server has. */
  function take(v: V) {
    view = v;
    engine = v.tutor;
    helpers = v.helpers;
    provider = v.api.provider;
    baseUrl = v.api.baseUrl;
    apiKey = '';
    removeKey = false;
    model = v.api.model;
    helperModel = v.api.helperModel;
    vision = v.api.vision;
  }

  async function loadModels() {
    modelsNote = words.settingsAsking;
    try {
      const res = await fetch('/api/settings/models');
      const body = (await res.json()) as ModelInfo[] | { error: string };
      if (!Array.isArray(body)) throw new Error(body.error);
      models = body;
      modelsNote = body.length ? words.settingsOnOffer(body.length) : words.settingsNoModels;
      return true;
    } catch (err) {
      models = [];
      modelsNote = words.settingsCouldNotList((err as Error).message);
      return false;
    }
  }

  function pickProvider(id: ProviderId) {
    const before = PROVIDERS.find((p) => p.id === provider);
    provider = id;
    const next = PROVIDERS.find((p) => p.id === id);
    // The usual address, unless one of the person's own was typed in.
    if (!baseUrl || baseUrl === before?.baseUrl) baseUrl = next?.baseUrl ?? '';
    models = [];
    modelsNote = '';
  }

  /** Picking a model the API describes sets whether it can see images. */
  function pickModel() {
    const info = models.find((m) => m.id === model);
    if (info?.vision !== undefined) vision = info.vision;
  }

  async function save() {
    if (!view) return;
    saving = true;
    message = null;
    const body: SettingsBody = { tutor: engine, helpers };
    if (usesApi || view.tutor === 'api') {
      body.api = { provider, baseUrl, model, helperModel, vision };
      if (removeKey) body.api.apiKey = '';
      else if (apiKey.trim()) body.api.apiKey = apiKey.trim();
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer = (await res.json()) as V | { error: string };
      if ('error' in answer) {
        message = { ok: false, text: answer.error };
        return;
      }
      take(answer);
      let text = words.settingsSaved;
      if (usesApi && answer.api.baseUrl) {
        const reached = await loadModels();
        text = reached ? words.settingsSavedAnd(modelsNote) : words.settingsSavedBut(modelsNote);
        if (reached && answer.api.model && models.length && !models.some((m) => m.id === answer.api.model))
          text += words.settingsNotListed(answer.api.model);
      }
      message = { ok: true, text };
    } catch {
      message = { ok: false, text: words.settingsCouldNotSave(name) };
    } finally {
      saving = false;
    }
  }

  function installed(id: AgentId): boolean {
    return view?.agents.find((a) => a.id === id)?.installed ?? false;
  }
</script>

<div class="page settings">
  <header class="page-head">
    <h1 class="page-title">{words.settings}</h1>
    <p class="page-lede">{words.settingsLede}</p>
  </header>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if view}
    <section class="block" aria-labelledby="who">
      <h2 id="who" class="section-title">{words.settingsWho}</h2>
      <div class="choices" role="radiogroup" aria-labelledby="who">
        {#each AGENTS as a (a.id)}
          {@const there = installed(a.id)}
          <label class="choice" class:on={engine === a.id} class:missing={!there}>
            <input type="radio" name="engine" value={a.id} bind:group={engine} disabled={!there && engine !== a.id} />
            <span class="choice-body">
              <span class="choice-name"
                >{a.name}{#if a.id === 'claude-code'}<em>{words.settingsDefault}</em>{/if}</span
              >
              <span class="choice-about">{words.settingsAbout(a.id, name, agent)}</span>
              {#if !there}<span class="choice-note"
                  >{words.settingsNotInstalled} <a href={a.site} target="_blank" rel="noreferrer">{words.settingsGetIt}</a></span
                >{/if}
            </span>
          </label>
        {/each}
        <label class="choice" class:on={engine === 'api'}>
          <input type="radio" name="engine" value="api" bind:group={engine} />
          <span class="choice-body">
            <span class="choice-name">{words.settingsApiChoice}</span>
            <span class="choice-about">{words.settingsAbout('api', name, agent)}</span>
          </span>
        </label>
      </div>
      {#if view.agentCommand && engine !== 'api'}
        <p class="note">{words.settingsRuns[0]} <code>{view.agentCommand}</code>{words.settingsRuns[1]}</p>
      {/if}
      {#if engine !== view.tutor && tutor.running && tutor.mode === 'terminal'}
        <p class="note">{words.settingsSwitch(tutor.name)}</p>
      {/if}
    </section>

    {#if usesApi}
      <section class="block" aria-labelledby="api">
        <h2 id="api" class="section-title">{words.settingsApiTitle}</h2>
        <div class="grid">
          <label for="provider">{words.settingsProvider}</label>
          <div>
            <select
              id="provider"
              class="field"
              value={provider}
              onchange={(e) => pickProvider((e.currentTarget as HTMLSelectElement).value as ProviderId)}
            >
              {#each PROVIDERS as p (p.id)}<option value={p.id}>{p.name}{p.local ? words.settingsLocal : ''}</option>{/each}
            </select>
            <p class="hint">{words.settingsProviderHint(provider, agent)}</p>
          </div>

          <label for="base">{words.settingsAddress}</label>
          <input
            id="base"
            class="field"
            bind:value={baseUrl}
            placeholder={preset?.baseUrl || 'https://…/v1'}
            spellcheck="false"
            autocomplete="off"
          />

          <label for="key">{words.settingsKey}</label>
          <div>
            <input
              id="key"
              class="field"
              type="password"
              bind:value={apiKey}
              placeholder={view.api.key && !removeKey ? words.settingsKeySaved(view.api.key) : preset?.key ? 'sk-…' : words.settingsKeyNone}
              autocomplete="off"
              spellcheck="false"
              disabled={removeKey}
            />
            {#if view.api.key && !view.api.keyFromEnv}
              <label class="inline"><input type="checkbox" bind:checked={removeKey} /> {words.settingsKeyRemove}</label>
            {:else if view.api.keyFromEnv}
              <p class="hint">{words.settingsKeyFrom(keyVariable)}</p>
            {/if}
            <p class="hint">{words.settingsKeyKept}</p>
          </div>

          <label for="model">{words.settingsModel}</label>
          <div>
            <input
              id="model"
              class="field"
              list="models"
              bind:value={model}
              onchange={pickModel}
              placeholder={words.settingsModelPlaceholder}
              spellcheck="false"
              autocomplete="off"
            />
            <datalist id="models">
              {#each models as m (m.id)}<option value={m.id}>{m.name ?? ''}{m.tools === false ? words.settingsNoTools : ''}</option>{/each}
            </datalist>
            <p class="hint">
              {modelsNote}
              {#if chosen?.tools === false}<strong class="warn">{words.settingsCantTools(agent)}</strong>{/if}
              {#if chosen?.context}{words.settingsContext(Math.round(chosen.context / 1000))}{/if}
            </p>
          </div>

          <label for="helper">{words.settingsHelper}</label>
          <div>
            <input
              id="helper"
              class="field"
              list="models"
              bind:value={helperModel}
              placeholder={words.settingsHelperPlaceholder}
              spellcheck="false"
              autocomplete="off"
            />
            <p class="hint">{words.settingsHelperHint}</p>
          </div>

          <span></span>
          <label class="inline"><input type="checkbox" bind:checked={vision} /> {words.settingsVision}</label>
        </div>
      </section>
    {/if}

    <section class="block" aria-labelledby="helpers">
      <h2 id="helpers" class="section-title">{words.settingsChatTitle}</h2>
      <p class="hint top">{words.settingsChatHint}</p>
      <div class="seg" role="radiogroup" aria-labelledby="helpers">
        <label class:on={helpers === 'claude-code'}
          ><input type="radio" name="helpers" value="claude-code" bind:group={helpers} disabled={!installed('claude-code')} /> Claude Code</label
        >
        <label class:on={helpers === 'api'}
          ><input type="radio" name="helpers" value="api" bind:group={helpers} /> {words.settingsApiTitle}</label
        >
      </div>
    </section>

    <footer class="save">
      <button class="primary" onclick={save} disabled={saving || !dirty}>{saving ? words.settingsSaving : words.settingsSave}</button>
      {#if message}<p class={message.ok ? 'ok' : 'error'} role="status">{message.text}</p>{/if}
    </footer>

    {@render after?.(view, set)}
  {:else}
    <p class="muted">{words.loading}</p>
  {/if}
</div>

<style>
  .settings {
    max-width: 52rem;
  }

  .block {
    margin-bottom: 40px;
  }

  .choices {
    display: grid;
    gap: 8px;
  }

  .choice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .choice:hover {
    background: var(--b1);
  }

  .choice.on {
    border-color: var(--acc-line);
    background: var(--acc-soft);
  }

  .choice.missing:not(.on) {
    cursor: default;
    opacity: 0.7;
  }

  .choice input {
    margin-top: 4px;
    accent-color: var(--acc);
  }

  .choice-body {
    display: grid;
    gap: 2px;
  }

  .choice-name {
    font-weight: 600;
  }

  .choice-name em {
    margin-left: 8px;
    font-style: normal;
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--faint);
  }

  .choice-about,
  .choice-note {
    font-size: 0.88rem;
    color: var(--muted);
  }

  .choice-note a {
    color: var(--acc);
  }

  .grid {
    display: grid;
    grid-template-columns: 11rem minmax(0, 1fr);
    gap: 14px 18px;
    align-items: start;
  }

  .grid > label {
    padding-top: 9px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--fg-2);
  }

  select.field {
    appearance: auto;
  }

  .hint {
    margin: 6px 0 0;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .hint.top {
    margin: -6px 0 12px;
  }

  .warn {
    color: var(--shaky);
    font-weight: 500;
  }

  .note {
    margin: 12px 0 0;
    font-size: 0.86rem;
    color: var(--muted);
  }

  .inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.88rem;
    color: var(--fg-2);
    cursor: pointer;
  }

  .inline input {
    accent-color: var(--acc);
  }

  .seg {
    display: inline-flex;
    padding: 3px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--b1);
  }

  .seg label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .seg label.on {
    background: var(--b0);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }

  .seg input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .save {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-top: 8px;
  }

  .save p {
    margin: 0;
    font-size: 0.9rem;
  }

  .ok {
    color: var(--solid);
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }

    .grid > label {
      padding-top: 10px;
    }
  }
</style>
