# @organon/core

Every version an app can pin, newest first. Each says what an app must change to move to it (none, if nothing), so
`docs/plano.md`'s rule holds: a fix in the core reaches an app only when the app moves its pin, after the canary.

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
