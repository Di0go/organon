# Organon

The shared core of the saga's apps: Aristotle (a tutor, `~/Projects/Aristotle`), Galen (a doctor and coach,
`~/Projects/Galen`) and the ones to come, the first of which is Argus (a readable network spy on `tshark`). One
package, `@organon/core`, that each app pins at an exact version: the agent bridge, chat, the MCP server, settings,
storage and backups, `.test`, systemd and release, and the interface's tokens, components and layout. Built for one
person; the plan, the boundary and the migration order are in [docs/plano.md](docs/plano.md) (in Portuguese), the
inventory it rests on in [docs/inventario.md](docs/inventario.md).

## Working on the core

- **What goes in, what stays in an app**: the test in docs/plano.md, «A fronteira». In short: it goes in if it means
  the same in two apps (or Argus needs it to be born) and names nothing of a domain; a mix goes in as a mechanism,
  with the domain coming in through an extension point. Nothing goes in on one use.
- **Upstream first.** A fix to shared code is made here, with a test that fails first, never only in an app.
- **A version is never rewritten.** `pnpm pack:release` packs `packages/core` at its `package.json` version into
  `releases/` and refuses a version that exists: bump it, and say in `packages/core/CHANGELOG.md` what an app must
  change to move to it. After a push, `pnpm publish:release` makes it a GitHub release, the URL an app pins.
- **Before a version leaves**, `pnpm gates`: lint, types, the core's tests, and `pnpm canary` against every app on
  the core (today `examples/minimal`, Argus, `../Argus`, and Galen, `../Galen`), which runs the app's own gates on a throwaway copy with this working tree's core.
- **The apps are read, never changed from here**: not their code, branches, instances or `data/`. An app moves to a
  new version in its own session.
- `examples/minimal` is not in the workspace on purpose: it installs the core from a release, as an app does (from
  `releases/` while the version is not yet a GitHub release, then from its URL). Its
  `pnpm dev` (server 4970, Vite 5193) and `pnpm gates` are what prove a change works.
- Verify with what runs (tests, the example's dev instance, headless Chromium through `playwright-core`), never with
  the desktop's own browser.
