<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/banner-dark.svg">
    <img src="docs/images/banner-light.svg" alt="Organon: the shared core of the saga's apps." width="100%">
  </picture>
</p>

<p align="center">
  <a href="#what-an-app-gets">What an app gets</a> ·
  <a href="#use-it">Use it</a> ·
  <a href="#release-a-version">Release a version</a> ·
  <a href="#the-apps">The apps</a>
</p>

<p align="center">
  <a href="https://github.com/Di0go/organon/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Di0go/organon?style=flat-square&label=%40organon%2Fcore&color=a8742a"></a>
  <img alt="Pinned, never rewritten" src="https://img.shields.io/badge/versions-pinned%2C%20never%20rewritten-555?style=flat-square">
  <img alt="Svelte 5" src="https://img.shields.io/badge/Svelte-5-ff3e00?style=flat-square&logo=svelte&logoColor=white">
  <img alt="TypeScript on Node 24+" src="https://img.shields.io/badge/TypeScript-Node%2024%2B-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-2e8b57?style=flat-square"></a>
</p>

---

**Organon is the core that [Aristotle](https://github.com/Di0go/aristotle), Galen and Argus are built on.** What the
three share is written once, here: the server and its checks, live events, the MCP server and its bridge, settings,
storage, release, the design tokens and the look, and the frame every page sits in (the ribbon, the tabs, the status
line, search, menus and charts), and in time the agent's drawer and chat. A fix made here reaches every app, and no app moves until it chooses to: each pins one exact
version, and before a version leaves, every app's own checks run against it.

Named after Aristotle's works on logic, the instrument the rest was built with. Built for one person, and open in
case it is useful to another.

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/core-dark.svg"><img src="docs/images/core-light.svg" alt="Diagram: @organon/core, one package whose versions are never rewritten, feeds Aristotle, Galen and Argus, each pinned at one version. A dotted line from the apps back to the core: the canary runs each app's own gates on a version before it leaves." width="876"></picture>
</p>

## What an app gets

One package, `@organon/core`, with a path for each part. The server's parts ship compiled; the interface ships as
source, served by the `organon()` Vite plugin.

| | Import | What it does |
|---|---|---|
| **Server** | `server/app`, `server/http` | `defineApp` over an `app.json`, and the server without its routes: loopback only, this user only, exact Host and Origin, the CSP, the built interface, health and state. |
| **Live events** | `server/events`, `ui/live` | One Server-Sent Events stream every open page listens on; the page's end reloads everything on reconnect and picks up a new release. |
| **MCP** | `server/mcp`, `server/bridge` | The app's tools for its agent, over HTTP and through a stdio bridge. |
| **Settings** | `server/settings`, `server/settings-routes`, `ui/AgentSettings.svelte` | The app's `settings.json`, with its own keys beside the core's. A file that can't be read or parsed is set aside and said, never written over. The page that picks who runs in the drawer, with the app's own sections after it. |
| **The agent** | `server/tutor`, `server/agents`, `server/terminal`, `server/tutor-api`, `server/llm`, `ui/TerminalDrawer.svelte` | The drawer at the foot of every page: an agent CLI in a pseudo-terminal (Claude Code by default), or the app's own agent on any OpenAI-compatible model API. |
| **The chat** | `server/chat`, `server/oneshot`, `ui/Page.svelte`, `ui/ChatPanel.svelte` | A chat beside a page, about what is on it, its answer streamed over the live events. |
| **Storage** | `server/store` | JSON files and append-only logs in the app's `data/`, written atomically and in turn, never over a file it could not read. |
| **Release** | `server/release`, `server/control`, `scripts/` | A clean name on `.test` with TLS, a systemd service, a release copy, and rollback. |
| **Entities** | `shared/entities` | An app's things as a graph: find by any name, walk the links, search. |
| **The frame** | `ui/Frame`, `ui/Ribbon`, `ui/TabBar`, `ui/StatusLine`, `ui/Search`, `ui/ContextMenu`, `ui/HoverCard` | The page's surroundings, with the app's places, tab titles, search, menu items and cards plugged in. |
| **Styles and words** | `ui/fonts.css`, `ui/tokens.css`, `ui/base.css`, `ui/shell.css`, `ui/dash.css`, `ui/words` | Inter and JetBrains Mono, colour and type in light and dark, the shared pieces, in English or Portuguese. |
| **Markdown** | `ui/markdown`, `ui/Markdown.svelte`, `ui/Lightbox.svelte`, `ui/maths`, `ui/prose.css`, `ui/katex.css` | Markdown sanitised, with maths, Mermaid diagrams, callouts, animated drawings and a lightbox; the app's own syntax and links plugged in. |
| **Charts** | `ui/charts/*` | Lines, columns, stacked columns, and every chart as a table, in series that stay apart for colour-blind eyes. |
| **The look** | `ui/theme`, `ui/LookPicker.svelte` | Light or dark, and the accent, set before the first paint. |
| **Tooling** | `server/gates`, `server/stop-hook`, `server/backup` | Every check in one command (`pnpm gates`), the Stop hook that sends an agent back to the docs its change left behind, and the data folder's own Git backups. |
| **Vite** | `vite` | `organon()`: serves the look's boot script, the dev port and proxy from `app.json`, and keeps the core's source out of pre-bundling, its interface's dependencies in it. |

## Use it

Pin a release by its URL. The lockfile keeps the tarball's hash, so a version can never change under an app.

```sh
pnpm add https://github.com/Di0go/organon/releases/download/v0.7.0/organon-core-0.7.0.tgz
```

Then wire it in, as [`examples/minimal`](examples/minimal) does:

```ts
// vite.config.ts
import { organon } from '@organon/core/vite';
export default defineConfig({ plugins: [svelte(), organon()] });

// ui/src/main.ts
import '@organon/core/ui/tokens.css';

// server/index.ts: the core, bound to this app's folders
const warnings = new Warnings();
const settings = createSettings({ file: SETTINGS_FILE, warnings, apiKey: process.env.MYAPP_API_KEY });
const store = createStore({ dataDir: DATA_DIR, warnings });
```

```html
<!-- ui/index.html: the app's key and default accent, before the first paint -->
<script src="/theme-boot.js" data-key="myapp.look" data-accent="violet"></script>
```

What changes between versions, and what an app must do to move, is in [CHANGELOG.md](packages/core/CHANGELOG.md).

## Release a version

A fix is made here first, with a test that fails before it. Then, in order:

| Command | What it does |
|---|---|
| `pnpm gates` | Lint, types, the core's tests, and the canary: every app's own checks on a throwaway copy, with this working tree's core |
| `pnpm pack:release` | Packs the version in `packages/core/package.json` into `releases/`, and never rewrites one |
| `pnpm publish:release` | After a push: a GitHub release on that commit, the tarball attached and checked back |

Before packing, the version goes up and `CHANGELOG.md` says what an app must change. `pnpm canary <app>… [--run "<cmd>"]` tries the core on one app alone. Why it is shaped this way, and
the order the apps move in, is in [docs/plano.md](docs/plano.md) (in Portuguese).

## The apps

| App | What it is | On the core |
|---|---|---|
| [Aristotle](https://github.com/Di0go/aristotle) | A tutor that makes you think, then makes you do | Third, after Galen |
| [Galen](https://github.com/Di0go/galen) | A doctor and a coach | Second |
| [Argus](https://github.com/Di0go/argus) | A readable network spy, on `tshark`, live | First, born on it |
| [`examples/minimal`](examples/minimal) | The smallest app on the core, at the size of a test | Every version, in every gate |

## License

[MIT](LICENSE).
