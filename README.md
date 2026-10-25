# Organon

The shared core of the saga's apps: [Aristotle](https://github.com/Di0go/aristotle), Galen and Argus. Named after
Aristotle's collected works on logic, the instrument the rest was built with.

**Status:** a proof. The form is chosen and works end to end on a first slice (settings and storage on the server;
design tokens, the look and its picker in the interface), consumed by `examples/minimal`. No app runs on it yet: the
order is in [docs/plano.md](docs/plano.md).

| Command | What it does |
|---|---|
| `pnpm install` | The core's workspace (`packages/core`) |
| `pnpm test` | The core's tests |
| `pnpm gates` | Lint, types, tests, and the canary against `examples/minimal` |
| `pnpm canary <app>… [--run "<cmd>"]` | Run an app's checks on a throwaway copy, with this working tree's core |
| `pnpm pack:release` | Pack the version in `packages/core/package.json` into `releases/` (never rewritten) |
| `python3 docs/inventario.py` | Measure the drift between Aristotle and Galen again, file by file |

An app depends on one exact version:

```json
"dependencies": { "@organon/core": "file:~/Projects/Organon/releases/organon-core-0.3.0.tgz" }
```

and adds `organon()` to its Vite plugins, `@organon/core/ui/tokens.css` to its styles, and
`<script src="/theme-boot.js" data-key="<app>.look" data-accent="<default>">` to its `index.html`. See
`examples/minimal`.

## License

[MIT](LICENSE).
