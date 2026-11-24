<img src="assets/icon.svg" width="64" height="64" alt="">

# drawboardmafia

A developer-first whiteboard where **the drawing is a text file**. You can sketch it, type it, diff it, merge it and render it in CI. The format is open, MIT-licensed and works without an account.

> Status: early. The headless toolchain works: the `.board` format, the `dbm` CLI and the git merge driver. The canvas app, live collaboration and the two-way text pane are next. See the [spec](docs/superpowers/specs/2026-11-24-drawboardmafia-design.md).

## The `.board` format

There's one element per line, in paint order. Ids stay stable when labels change, and defaults are omitted, so git diffs stay small and readable.

```
board 1
// Checkout flow
f1: frame "Checkout service" @40,20 820x420 { web api db cache }
web: box "Web app" @80,80 fill=violet
api: box "API Gateway" @360,80 200x80 fill=blue
db: cylinder "Postgres" @680,60 fill=green stroke=green
cache: ellipse "Redis"
web -> api "HTTPS"
api -> db "reads" route=elbow
api -> cache dash=dashed
```

Nodes without a position (like `cache` above) are placed automatically next to the nodes they connect to. The full reference is in [docs/format.md](docs/format.md).

## CLI

```sh
npm i -g drawboardmafia

dbm render arch.board -o arch.svg            # or .png; --theme dark, --frame <id>
dbm fmt arch.board                           # canonical form (use --check in CI)
dbm check docs/**/*.board                    # syntax errors and dangling references
dbm diff old.board new.board                 # "api: moved (+40,0); relabelled …"
dbm from-mermaid flow.mmd -o flow.board      # Mermaid flowchart import
dbm from-excalidraw sketch.excalidraw -o sketch.board
```

SVG exports embed the board source, so an exported image can be turned back into a board.

## Git merges without conflict markers

```sh
dbm init     # adds `*.board merge=dbm` to .gitattributes and configures the driver
```

After `dbm init`, `git merge` merges boards **property by property**. One branch can move `api` while another relabels it, both on the same line, and the result has both changes with no conflict markers. When both branches change the same property, ours wins and the conflict is printed. Element order, frame membership and header settings merge as well.

## Development

```sh
pnpm install
pnpm test        # vitest, including property-based round-trip and merge tests
pnpm typecheck
pnpm build       # bundles the CLI to packages/cli/dist/dbm.js
```

| Package | Purpose |
|---|---|
| `packages/core` | Element schema, palette, geometry, auto-placement |
| `packages/format` | Lexer, parser, canonical serializer, three-way merge, diff, importers |
| `packages/render` | Board to SVG (shared text metrics, theme-aware palette) |
| `packages/cli` | The `dbm` command |

## License

MIT
