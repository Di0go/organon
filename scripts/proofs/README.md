# Proofs

The scripts behind docs/plano.md, «A prova», kept so they can be run again, and so each migration step has a model
for its own differential tests. Each reads an app; none writes to it.

- `node-modules-ts.sh`: Node refuses TypeScript under node_modules (why the core's server ships compiled).
- `settings-overwrite.ts <app>`: the original settings.ts of an app writes over a settings.json with a stray comma.
- `settings-differential.ts <app>`: the app's settings.ts and the core's, on copies of the app's real settings.json,
  give the same view, file and endpoint after the same changes. Prints hashes, never values; deletes its copies.
