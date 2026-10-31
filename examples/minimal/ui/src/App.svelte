<script lang="ts">
  // The core's frame around three pages: Home (the app's own motto, the core's look picker, who runs the agent through
  // the core's settings, the core's Markdown with the app's links to notes), Notes (live over the core's event stream,
  // searched by the core's palette, charted by its columns, with the core's chat beside it) and Settings (the core's
  // AgentSettings, with the motto as the app's own section). The core's agent drawer at the foot, opened from the
  // status line or with Ctrl+`. Each extension point gets one thing of the app's: an index of the notes as the frame's
  // rail, a note being typed keeping focus mode on Escape, the notes counted on the ribbon, one tab for every note, a
  // note's own card on hover, and the chat told how many notes there are.
  import type { Place } from '@organon/core/ui/Ribbon.svelte';
  import AgentSettings from '@organon/core/ui/AgentSettings.svelte';
  import type { SettingsView } from '@organon/core/shared/agents';
  import ChatPanel from '@organon/core/ui/ChatPanel.svelte';
  import Columns from '@organon/core/ui/charts/Columns.svelte';
  import ContextMenu from '@organon/core/ui/ContextMenu.svelte';
  import Frame from '@organon/core/ui/Frame.svelte';
  import HoverCard from '@organon/core/ui/HoverCard.svelte';
  import Lightbox from '@organon/core/ui/Lightbox.svelte';
  import Markdown from '@organon/core/ui/Markdown.svelte';
  import { renderMarkdown } from '@organon/core/ui/markdown';
  import LookPicker from '@organon/core/ui/LookPicker.svelte';
  import Ribbon from '@organon/core/ui/Ribbon.svelte';
  import Search from '@organon/core/ui/Search.svelte';
  import StatusLine from '@organon/core/ui/StatusLine.svelte';
  import TabBar from '@organon/core/ui/TabBar.svelte';
  import TerminalDrawer from '@organon/core/ui/TerminalDrawer.svelte';
  import { tutor } from '@organon/core/ui/tutor';
  import Page from '@organon/core/ui/Page.svelte';
  import { notes, router, tabs } from './state.svelte.ts';
  import { theme } from './theme.svelte.ts';

  type View = { tutor: string; agents: { id: string; name: string }[]; motto: string };

  // Everything the core's Markdown does, small: a table whose cells hold a "|" of their own, maths, a diagram.
  const SAMPLE = [
    '## On the core',
    '',
    '| Code | Maths | Term |',
    '|---|---|---|',
    '| `a|b` | $|x|$ | {{pipe|a bar that is not a border}} |',
    '',
    '$$\\int_0^1 x\\,dx = \\tfrac{1}{2}$$',
    '',
    '```mermaid',
    'graph LR',
    '  A[Note] --> B[Page]',
    '```',
    '',
    'Open [the first note](notes/0.md) or [the site](https://example.org).',
  ].join('\n');

  /** A link to notes/N.md opens that note; the rest are left as written. */
  function links(href: string): string | undefined {
    const n = /^notes\/(\d+)\.md$/.exec(href)?.[1];
    return n === undefined ? undefined : `#/notes/${n}`;
  }

  const HOME = 'M3.5 9.5 10 4l6.5 5.5M5.5 8v8.5h9V8M8.5 16.5v-4.5h3v4.5';
  const NOTE = 'M5.5 3.5h8a1 1 0 0 1 1 1v12h-8a1 1 0 0 1-1-1zM5.5 13.5h9M8.5 7h3';
  const GEAR = 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2';

  let view = $state<View | null>(null);
  let problem = $state('');
  let draft = $state('');

  const page = $derived(router.route.page);
  const places = $derived<Place[]>([
    { id: 'home', label: 'Home', href: '#/', icon: HOME, on: page === 'home' },
    {
      id: 'notes',
      label: 'Notes',
      href: '#/notes',
      icon: NOTE,
      on: page === 'notes' || page === 'note',
      count: notes.list.length,
      countTitle: `${notes.list.length} notes`,
    },
    { id: 'settings', label: 'Settings', href: '#/settings', icon: GEAR, on: page === 'settings' },
  ]);

  function title(key: string): string {
    const r = router.parse(key);
    if (r.page === 'note') return notes.list[r.n] ?? `Note ${r.n + 1}`;
    if (r.page === 'settings') return 'Settings';
    return r.page === 'notes' ? 'Notes' : 'Home';
  }

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

  async function add() {
    if (!draft.trim()) return;
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }) });
    draft = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      tutor.toggle();
    }
  }

  load();
  notes.live.start();
  tutor.connect();
</script>

<svelte:window onkeydown={onKey} />

<Frame app="minimal" railLabel="Index" busy={() => draft.trim() !== ''}>
  {#snippet ribbon()}<Ribbon {places} look={theme} />{/snippet}
  {#snippet rail(close: () => void)}
    <nav class="index">
      <h2>Index</h2>
      {#each notes.list as n, i (i)}<a href="#/notes/{i}" onclick={close}>{n}</a>{/each}
    </nav>
  {/snippet}
  {#snippet brand()}minimal{/snippet}
  {#snippet tabbar()}<TabBar
      {tabs}
      {title}
      icon={(key) => ({ home: HOME, settings: GEAR })[router.parse(key).page as 'home'] ?? NOTE}
    />{/snippet}
  {#snippet status()}
    <StatusLine warnings={notes.warnings}>
      <span class="st"><i class:on={notes.live.connected}></i>{notes.list.length} notes</span>
      <button class="st drawer-toggle" onclick={() => tutor.toggle()} title="The terminal the agent runs in (Ctrl+`)">
        <i class:on={tutor.running}></i>{tutor.mode === 'api' ? 'Agent' : 'Terminal'}
      </button>
    </StatusLine>
  {/snippet}

  {#if page === 'home'}
    <div class="page">
      <header class="page-head">
        <h1 class="page-title">{view?.motto || 'Organon'}</h1>
        <p class="page-lede">The smallest app on the core.</p>
      </header>
      <div class="pick"><LookPicker look={theme} /></div>
      <!-- A class of the app's own that the core's chat panel also uses: the core's rules must leave it alone. -->
      <aside class="side" data-testid="own-side">The app's own side note</aside>
      <p class="filled" data-testid="filled" data-tip="Filled with the accent, written in its --on-acc." data-tip-title="The accent">
        On the accent
      </p>
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
      <section class="band" data-testid="markdown">
        <Markdown
          source={SAMPLE}
          look={theme}
          {links}
          enhance={[
            // Run once per render: counts its runs. And one that follows the notes, re-run alone when they change.
            (el) => void (el.dataset.runs = String(Number(el.dataset.runs ?? 0) + 1)),
            (el) => void (el.dataset.notes = String(notes.list.length)),
          ]}
        />
      </section>
    </div>
  {:else if page === 'settings'}
    <AgentSettings name="Minimal">
      {#snippet after(v: SettingsView & { motto?: string }, set)}
        <section class="band" aria-label="The motto">
          <label
            >Motto <input
              value={v.motto ?? ''}
              onchange={async (e) => {
                await change({ motto: e.currentTarget.value });
                if (view) set({ motto: view.motto });
              }}
            /></label
          >
        </section>
      {/snippet}
    </AgentSettings>
  {:else}
    <Page app="minimal" name="Minimal" loaded={notes.live.loaded}>
      {#snippet chat()}
        <ChatPanel
          chats={notes.chats}
          thread="notes"
          title="The notes"
          where={() => `The notes · ${notes.list.length} of them`}
          placeholder="Ask about a note…"
          name="Minimal"
          markdown={renderMarkdown}
          page={() => notes.list.join('\n')}
          mentions={() => notes.list.map((n, i) => ({ label: n, kind: 'Note', hint: `#${i + 1}`, context: () => `Note ${i + 1}: ${n}` }))}
        />
      {/snippet}
      <header class="page-head">
        <h1 class="page-title">{router.route.page === 'note' ? title(location.hash) : 'Notes'}</h1>
      </header>
      <section class="band">
        <ul class="recs" aria-label="Notes">
          {#each notes.list as n, i (i)}
            <li>
              <a class="rec acc" href="#/notes/{i}" data-menu={i} data-note={i}
                ><span class="rec-t">{n}</span><span class="rec-m">{n.length}</span></a
              >
            </li>
          {:else}
            <li class="rec empty">No notes yet.</li>
          {/each}
        </ul>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input class="input" aria-label="New note" bind:value={draft} /> <button class="ghost small">Add</button>
        </form>
      </section>
      {#if notes.list.length}
        <section class="band">
          <Columns label="Characters" points={notes.list.map((n, i) => ({ key: String(i), label: String(i + 1), value: n.length }))} />
        </section>
      {/if}
    </Page>
  {/if}
</Frame>

{#if tutor.mounted}
  <TerminalDrawer app="minimal" title="Organon minimal" look={theme} markdown={renderMarkdown} />
{/if}

<HoverCard targets="[data-note]" entityOf={(el) => (el.dataset.note === undefined ? undefined : `note:${el.dataset.note}`)}>
  {#snippet entity(key: string)}
    {@const n = Number(key.slice(5))}
    <div class="note-card"><strong>Note {n + 1}</strong> {notes.list[n] ?? ''}</div>
  {/snippet}
</HoverCard>
<Lightbox />
<Search
  kinds={{ note: 'Note' }}
  search={(q) =>
    notes.list
      .map((title, i) => ({ kind: 'note', title, href: `#/notes/${i}` }))
      .filter((h) => h.title.toLowerCase().includes(q.toLowerCase()))}
/>
<ContextMenu
  app="minimal"
  actions={(el) => {
    const n = el.closest<HTMLElement>('[data-menu]')?.dataset.menu;
    return n === undefined ? [] : [{ label: 'Open the note', run: () => (location.hash = `#/notes/${n}`) }];
  }}
/>
