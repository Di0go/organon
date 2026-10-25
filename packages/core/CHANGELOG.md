# @organon/core

Every version an app can pin, newest first. Each says what an app must change to move to it (none, if nothing), so
`docs/plano.md`'s rule holds: a fix in the core reaches an app only when the app moves its pin, after the canary.

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
