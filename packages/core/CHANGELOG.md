# @organon/core

Every version an app can pin, newest first. Each says what an app must change to move to it (none, if nothing), so
`docs/plano.md`'s rule holds: a fix in the core reaches an app only when the app moves its pin, after the canary.

## 0.7.0

**What an app changes:** nothing to keep working. To use the core's Markdown instead of its own copy (Galen's and
Aristotle's `markdown.ts`, `tables.ts`, `maths.svelte.ts`, `visible.ts`, `Markdown.svelte`, `Lightbox.svelte`,
`prose.css`), each becomes a shim:

- `ui/markdown`: `renderMarkdown`, `renderInline`, and `createMarkdown({ extensions, tablePieces, keep })` for an app
  with syntax of its own (Aristotle's `[[concept]]` links: the extension, and its pattern so a table cell keeps it
  whole); `escapeHtml` and `startAt` for writing those extensions. `ui/tables`: `escapeTablePipes`.
- `ui/Markdown.svelte`: `source`, `inline`, and the app's `markdown` (its renderer), `links` (href in, the app's href
  or undefined out: Galen's links between notes), `look` (its theme, so diagrams follow it), `enhance` (its own work
  on the rendered page) and `ownFigures` (a selector its own live figures answer to).
- `ui/Lightbox.svelte`: `figure` (the app's own figures first: Aristotle's plate, its kit left alone).
- `ui/maths` (KaTeX, loaded after the first paint), `ui/visible`, `ui/prose.css`, `ui/katex.css`.
- Mermaid asks for a KaTeX of its own; keep `"mermaid>katex": "^0.19.0"` in the app's `pnpm.overrides`, which only
  count at the root of an install, so the core can't carry it.

- **Fix:** a table cell's `` `a|b` ``, `$|x|$` and `{{term|definition}}` no longer split the row (Aristotle's
  3516991, which Galen did not have).
- **Fix:** a look changed while a Mermaid diagram was first drawn left its placeholder for good; it is drawn in the
  new look. Found by the example's dev test.
- `organon()` puts the core's interface's dependencies (`marked`, `dompurify`, `katex`, `mermaid`) in Vite's
  pre-bundling, through the core: left to the dev server, Mermaid's CommonJS `dayjs` stops it.

**The agent's drawer and the chat beside a page.** Nothing to change to keep working either. An app on the core with
node-pty in its dependencies already keeps it; any other adds `node-pty` to pnpm's `onlyBuiltDependencies` (it ships
prebuilt binaries, and builds when there are none). To use what is new (Galen's and Aristotle's own copies become
shims):

- `server/agents` (`createAgents({ app, settings })`, `agentCommand`), `server/terminal` (`Terminal`), `server/tutor`
  (`new Tutor({ app, settings, api })`, whose `upgrade` goes to `serve({ upgrade })` and takes `/api/terminal`) and
  `server/tutor-api` (`ApiTutor`: the app's own agent on a model API, with the app's MCP server in process, its words
  for what it is and where, `summarize`, `activity`, `toolTimeoutMs`, `blind`, `words`). <PREFIX>_CLAUDE_CMD,
  _TERMINAL_QUIET_MS and _DRAWER as in the apps.
- `server/oneshot` (`createOneshot({ app, settings })`: <PREFIX>_ONESHOT_CMD, _ONESHOT_MODEL, _CLAUDE_CWD),
  `server/chat` (`Chats.load({ app, store, oneshot, system, tools?, person? })`, `onEvent`, `chatRoutes(chats, {
  context })`), `server/llm` (with `identity` for OpenRouter), `server/web` (`agent` in the user agent),
  `server/slug`, `server/backup` (`new Backup({ app, warnings, describeChanges })`).
- `shared/agents` adds TutorMessage, TutorClientMessage and TutorEntry; `shared/chat` has ChatMessage, ChatThread and
  ChatEvent.
- `ui/tutor`, `ui/chats` (ChatStore, for the app's feed), `ui/drafts`, `ui/TerminalDrawer.svelte`,
  `ui/TerminalView.svelte`, `ui/TutorConversation.svelte`, `ui/Composer.svelte`, `ui/ChatPanel.svelte`,
  `ui/Page.svelte` and `ui/agent.css` (after shell.css and dash.css). Their words are in words.ts; an app says its own
  with `setWords` where they name what it keeps. Frame keeps drafts under the app's name.
- `organon()` pre-bundles the drawer's xterm through the core too (`@xterm/xterm`, `@xterm/addon-fit`).

**Settings, the tooling, the hover card and the charts.** Nothing to change to keep working. To use what is new:

- `server/settings-routes` (`settingsRoutes(settings, { view, identity })`): GET and PUT `/api/settings` and GET
  `/api/settings/models`, as Aristotle and Galen wrote them twice. `view` is what both answer with, the app's keys on
  it (Galen's watch door).
- `ui/AgentSettings.svelte` (`name`, and `after`: the app's own sections after Save, given the view and `set` to lay a
  newer view's keys of the app's over it): who runs in the drawer, the model API, the chat. Its words are in words.ts
  (`settings*`, English and Portuguese); `settingsAgent` is what the page calls who runs there ("agent"; Aristotle's
  "tutor"), and `settingsLede`, `settingsSwitch` what the app keeps.
- `server/gates` (`runGates(root, gates)`) and `server/stop-hook` (`runStopHook(root, { zones, generate })`,
  `undocumented`, `NO_DOCS`, `NO_DOCS_AUTHOR`, `DocZone`): Aristotle's and Galen's scripts/gates.ts and
  claude-stop-hook.ts, the same file but for names; the app hands in its gates, its doc zones and its docs generator.
  The hook stays out of the app's drawer by `<PREFIX>_DRAWER`.
- `ui/HoverCard.svelte`: a `{{term|definition}}` gets its card, and `inline` lets the app render each paragraph of a
  card (Galen's Markdown in a tip).
- `ui/charts/LineChart.svelte` takes `left`, its left margin (44 px by default).
- **Fix:** a tick at either end of a chart's axis is anchored inside it (start or end) whoever chose the ticks; given
  ticks were centred and cut at the edge.

## 0.6.1

Nothing to change in an app.

- **Fix:** `organon()` has Vite's dependency scan treat the core as external. Crawling the core's `.svelte` files,
  Vite 8's scan failed on their own relative imports (`./LookPicker.svelte` from `Ribbon.svelte`), skipped
  pre-bundling, and an app with dependencies of its own found them with the page already loading: `504 Outdated
  Optimize Dep` and a reload in `pnpm dev`. The build was not affected. Found by Galen's dev test.

## 0.6.0

**What an app changes:** nothing to keep working. In dev, Vite's proxy now carries WebSockets on `/api`, as the
short form did not. Pulled by Galen's move to the core (docs/plano.md, step 2); to use what is new:

- `serve({ upgrade })`: a WebSocket (or any upgrade) the app takes, after the core's checks: the exact Host, an
  Origin of the app's own (a browser always sends one on a WebSocket, so none is refused), never cross-site. The
  handler takes the socket and returns true; anything else gets a 403. Galen's terminal drawer (`/api/terminal`).
- `server/method`: `createMethod({ root, section, otherAgents, prompts, tool, prompt })`, the app's skills, helpers
  and the rules of one section of its AGENTS.md, for agents that don't load skills: the `method` tool and the skills
  as prompts (`register(mcp, { inProcess })`), and `handed(name)` for the app's own agent in process. Aristotle's and
  Galen's method.ts, with their words given by the app.
- `createMcpHandler({ extend })`: more for one request's server, by `client` and `drawer` (the method, for the
  clients that don't have the skills). **Fix:** a client over HTTP can't take the app's own name (`X-Organon-Agent:
  <name>`), which is its agent's in process.
- **Fix:** `release` refuses a lockfile that pins a tarball by URL with no integrity (pnpm left it out on Galen's
  move to 0.5.1, and the release copy's frozen install refuses it), before building or stopping anything.
- **Fix:** a rollback to a release from before the app was on the core installs the service with that release's own
  `scripts/install-service.sh`; the core's was looked for in its node_modules, where it is not.
- `organon()`: `/api` is proxied with `ws: true` (and `changeOrigin`, as the short form had), so the drawer works
  through Vite in dev.
- Tests: the bridge's cancellation (a call the client cancels gets no answer, the next one does), which nothing
  tested.

## 0.5.1

**What an app changes:** nothing. An app whose accent is red looks different, as it should:

- **Fix:** the red accent (`#d1343c`, dark `#f2636a`) was the red of `--wrong` (`#c43c3c`, dark `#ef6b6b`): a link, a
  selected row or a live dot looked like an error. Red is now a crimson, `#bf124e` (dark `#f15f7f`, with a dark
  `--on-acc`, `#2a0a12`, since white on it read at 3:1), and under it `--wrong` moves to a vermilion, `#bc461e` (dark
  `#ee7746`), so what says a problem still reads as one and never as the accent. Both read at 4.5:1 or more on their
  ground; `tests/ui.test.ts` holds them at least 0.09 apart in Oklab, in light and in dark. The picker's swatch
  follows. `--heart` is unchanged (it is red whatever the accent). Argus's default accent is red.

## 0.5.0

**What an app changes:** nothing to keep working. `LookPicker` now speaks the app's language (`setWords`); an app
that says nothing keeps English. To use what is new:

- `server/events`: `EventHub`, Server-Sent Events for every open page (`events.stream(req, res)` in a route,
  `events.send(event)`). Retry in 2 s, a ping every 20 s; a page that stops reading (its unread data past 4 MB) is let
  go rather than buffered without end. From Galen's `streamEvents`.
- `ui/live`: `LiveStream`, the page's end: opens the stream, opens it again when it dies or goes quiet, reloads the
  whole state on every connect (events meanwhile held and applied after), and loads a new release's interface. Plus
  `getJson` and `sendJson`. From Galen's `feed.svelte.ts`, the transport without the records.
- The frame, from Galen: `ui/Frame.svelte` (ribbon column, small screen's bar and slide-in ribbon, stage, status
  column, focus mode), `ui/Ribbon.svelte` (the app's `places`, search, focus, the look), `ui/TabBar.svelte` with
  `ui/tabs` (`createTabs`), `ui/StatusLine.svelte` (dev badge, warnings, the app's items), `ui/Search.svelte` (the
  app's `search` and `kinds`), `ui/ContextMenu.svelte` (copy and search on selected text, the app's `actions` on
  anything else), `ui/router` (`createRouter`, `hashParts`, `hashQuery`), `ui/frame` (`searchBox`, `focus`).
- Styles, from Galen: `ui/fonts.css` (Inter and JetBrains Mono from the packages, now core dependencies),
  `ui/base.css`, `ui/shell.css` (without the drawer, which comes with it), `ui/dash.css` (panels, tiles, bands, lists,
  records), `ui/charts.css`.
- `ui/words`: the frame's words in English or Portuguese (`setWords('pt')`), and `ui/format` (dates, times, plurals,
  numbers in that language; `asDate` reads "YYYY-MM-DD" as local noon).
- `ui/charts`: `LineChart` (x is any number: a day's noon from `dayX`, a moment in ms; a shaded area), `Columns`,
  `StackedColumns` (a `format` for the values), `TableView`, and `scale` (`niceTicks`, `niceRange`, `timeTicks`).
  Galen's charts took days; moving to these, its pages pass `dayX(date)` and their own labels.
- **Fix:** the small screen's bar drew its search glyph filled (a black disc); it is stroked now.
- **Fix:** `writeFileAtomic` (and so the store's `writeJson`) used one shared `<file>.tmp`: two writes to the same file at
  once failed with ENOENT, or could leave it half one body, half the other. Each write now has its own temp file, and
  writes to one file go in turn. Found by Argus's red team (a PUT and the minute's save at once).
- **Fix:** the search palette's marking escaped the text first and marked after, so typing "lt" marked the inside of
  `&lt;`. Now it splits first and escapes each piece (`ui/mark`, with a test).
- `LiveStream` takes `seq`: when the server numbers its events and `reload` returns `{ build, seq }`, the events held
  during a load that the state already includes are dropped instead of laid over it. `reload` may still return the
  build alone.

## 0.4.1

Nothing to change in an app.

- **Fix:** `release` refuses, before building or stopping anything, a lockfile whose core (or any `file:` tarball) the
  release copy cannot reach. pnpm writes a `file:` pin relative to the lockfile even when package.json gives an
  absolute path, so a pin on `releases/` installs in the checkout and fails in `~/.local/share/<app>/app`. Found on
  Argus's first release, in a throwaway copy, before any deploy. The way out is the GitHub release URL.

## 0.4.0

**What an app changes:** nothing to keep working. To use what is new, an app adds an `app.json` at its root (name,
title, hostname, loopback, ports, defaultAccent) and moves onto the pieces below; Argus is the first app built on
them, `examples/minimal` uses them too.

What Argus needed to be born, extracted from Galen (docs/plano.md, step 0) rather than copied:

- `server/app`: `defineApp(root)` over `app.json`: instance, ports, folders, the exact Hosts and Origins, TLS, pid
  and log files, the service and the release copy, `<PREFIX>_*` overrides. Galen's and Aristotle's config.ts.
- `server/http`: `serve(app, { api, mcp, state, warnings, accent, stop })`: the server without its routes. Loopback
  and ::1, HTTPS once tls.sh made a certificate, other users' connections refused (`server/peer`), Host, Origin and
  Sec-Fetch-Site checked, the CSP and the other headers, a JSON body required, the built interface with the
  install's accent, `/api/health`, `/api/state` with the build (the page reloads on a new release), the pid file.
  `ApiError`, `json`, `send`, `readJson`.
- `server/mcp`: `defineTools`, `createMcpHandler` (stateless, one McpServer per request, the drawer's core tools
  always loaded), `checkTools` (Claude Code's 2048-character limit), `z` (the SDK's own zod). New dependencies:
  `@modelcontextprotocol/sdk`, `zod`.
- `server/bridge` (`runBridge`), `server/control` (`createControl`, `controlCli`: `pnpm app`), `server/release`
  (`release`: gates, the worktree copy, frozen install, the service, rollback), `server/dev` (`runDev`).
- `scripts/`: `tls.sh`, `setup-hostname.sh` (with `--print`, which needs no root), `install-service.sh`, all reading
  `app.json`; an app runs them as `node_modules/@organon/core/scripts/<name>.sh <app root>`.
- `shared/entities`: `EntityGraph` (find by key, id, name or other name, case and accents aside; neighbours, `linked`
  with both directions joined, `twoSteps`; search with a snippet), `keyOf`, `fold`. From Galen's entities and search,
  with the kinds left to the app.
- `ui/HoverCard.svelte`: one hover card for the app: `data-tip`, or `data-tip-entity` drawn by the app's snippet.
- `testing`: `startServer` (the app's real server on throwaway folders, its own `<PREFIX>_*` kept out),
  `freePort`, `findChromium` (a failure under `ORGANON_REQUIRE_CHROMIUM`).
- `organon({ root })`: given the app's root, Vite's port and its proxy (`/api`, `/mcp`) come from `app.json`.

## 0.3.0

**What an app changes:** its writes to data/ go through its store's `writeJson` / `writeFileAtomic` (the `Store` that
`createStore` returns), not the free functions of the same name. In an app's `server/store.ts` shim, export the
store's ones.

- **Fix:** a data file that is there but can't be read (permissions, a disk error) was loaded as the fallback and the
  next write replaced it, losing what it held (the same defect as settings.json's in 0.1.x, in the store). It is now
  said and remembered, and the store's `writeJson` refuses it until a later load reads it.

## 0.2.0

Nothing to change in an app.

- **Fix:** a settings.json that exists but can't be read (permissions) is said, and changes are refused instead of
  written over it (0.1.x wrote over it, losing what it held).
- **Fix:** changes to settings made at once are written in turn, each on the state the one before left (two at once
  could fail on the shared temp file, or leave the file behind memory). The temp file is made 600 before the rename.
- `theme-boot.js` reads the keys named in `data-legacy` when its own key is empty, as `createTheme`'s `legacyKeys`.

## 0.1.1

- **Fix:** `organon()` leaves the core out of Vite's dependency pre-bundling. With 0.1.0, `pnpm dev` stopped at
  start ("Unexpected token" in `ui/theme.svelte.ts`); the build was not affected. No change in the app.

## 0.1.0

The first slice, to prove the form (docs/plano.md, "A prova").

- `server/settings`: Aristotle's and Galen's settings.ts as one, created with the app's file, warnings and API key.
  An app's own keys go through `extra` / `setExtra`. **Fix:** a settings.json that doesn't parse is set aside and
  said, not overwritten by the next change (reproduced on Galen's code: a stray comma loses a hand-set `agentCommand`
  or the watch's token).
- `server/store`: the stores' reading and writing, unchanged, bound to the app's data folder by `createStore`.
- `server/warnings`, `shared/agents`, `shared/accents`.
- `ui/tokens.css`: the design tokens, from Galen's base.css (green, `--on-acc` per accent in dark, chart series fixed
  and colour-blind safe). **Visible in Aristotle:** its charts stop following the accent.
- `ui/theme`, `ui/LookPicker.svelte`, `ui/theme-boot.js` and the `organon()` Vite plugin that serves it.
