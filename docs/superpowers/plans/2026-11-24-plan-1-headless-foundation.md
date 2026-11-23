# Plan 1: headless foundation (core, format, render, cli)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans or superpowers:subagent-driven-development to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested, headless `.board` toolchain:
- parse and canonically serialise boards, with a lossless round trip;
- three-way merge and semantic diff;
- Mermaid and Excalidraw import, and SVG and PNG rendering;
- a `dbm` CLI usable as a git merge driver.

**Architecture:** Plain TypeScript packages with no DOM dependency. `core` holds element types, defaults and placement. `format` depends on `core`; `render` depends on `core` and `format`. `cli` bundles all three. Internal packages export their TS source directly (`"exports": "./src/index.ts"`), and only the CLI has a build step (tsup).

**Tech stack:** Node 22, pnpm 10 workspaces, TypeScript (strict), Vitest, fast-check, tsup, perfect-freehand, @resvg/resvg-js.

**Plan series** (each is its own plan, written when the previous one ships):
1. This plan. It covers spec M0 + the format part of M3 + M4.
2. The canvas engine and store: ops, HLC, undo, the Canvas2D renderer. Spec M1.
3. Tools and editing. Spec M2.
4. The app shell and persistence: IndexedDB, open folder, external merge, export. Spec M3 app part.
5. Collaboration: the relay and the client. Spec M5.
6. The two-way DSL pane plus polish and launch. Spec M6–M7.

## Global constraints (from the spec)

- MIT licence. No dependency on the tldraw editor packages.
- **One element per line.** File order is paint order (z). Nothing in the file changes unless it was edited.
- **Integer coordinates on disk;** `rot` gets 1 decimal place. Defaults are omitted, and attributes appear in a fixed canonical order.
- **Determinism:** `serialize(parse(serialize(b))) === serialize(b)` for every board, enforced by property tests.
- **Untrusted input:** parsers never `eval`. Text is never treated as HTML, and the SVG output escapes all text.
- **CLI safety:** file size cap of 20 MB. No network access.
- **Colours** are palette tokens (`ink gray red orange yellow green blue violet`) or `#rrggbb`.

## Format decisions made in this plan (the spec is updated to match)

| Decision | Detail |
|---|---|
| **Parser** | A hand-written, line-oriented lexer and parser instead of a Lezer grammar. The format is line-based, so per-line error tolerance comes free. The editor pane can reuse the tokenizer via CodeMirror's `StreamLanguage`. |
| **No `z` keys in the file** | Line order is z order. In-memory fractional keys are assigned on load (plan 2). |
| **Connectors** | `a -> b` is an arrow, `a <-> b` has two heads, `a -- b` has no heads. A connector's id may be omitted when it equals `from-to` (both ends bound); otherwise it's written as `id: a -> b`. |
| **Comments** | `//` comment lines attach to the next element (`comments: string[]`). Comments at the end of the file are kept in `board.trailingComments`. Trailing comments at the end of a line are not supported. |
| **Strings** | Double-quoted, with escapes `\\`, `\"` and `\n`. |

### Line grammar

```
file      := header (line)*
header    := "board" SP "1" (SP attr)*                   // attrs: sketch=0|1|2 bg=<color> grid=dots|lines|none
line      := comment | node | connector | blank
comment   := "//" text
node      := id ":" SP type (SP string)? (SP pos)? (SP size)? (SP members)? (SP attr)*
connector := (id ":" SP)? end SP op SP end (SP string)? (SP attr)*
op        := "->" | "<->" | "--"
end       := id | "(" int "," int ")"
pos       := "@" int "," int
size      := int "x" int
members   := "{" (SP id)* SP "}"
attr      := key "=" (bare | string)
id        := [a-z][a-z0-9_-]* | "~"[a-z0-9]{6}
type      := box | ellipse | diamond | cylinder | text | note | code | frame | image | ink
```

### Canonical attribute order

`fill stroke width dash sketch font size align lang route rot via asset pts locked group`.

---

### Task 1: Monorepo scaffold and CI

**Files:** create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `.gitignore`, `.github/workflows/ci.yml`, and `packages/{core,format,render,cli}/package.json` with `src/index.ts` and `test/smoke.test.ts`.

- [ ] Add a smoke test in each package that imports its index, then run `pnpm test`. Expected: it fails until the packages exist.
- [ ] Create the workspace. The root scripts are `test` (`vitest run`), `typecheck` (`tsc -p tsconfig.json --noEmit`) and `format`.
- [ ] Run `pnpm install && pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] Commit `scaffold monorepo`.

### Task 2: core schema, defaults, palette

**Files:** `packages/core/src/{schema.ts,defaults.ts,palette.ts,geometry.ts,index.ts}` and `packages/core/test/schema.test.ts`.

**Produces:**

```ts
type Id = string; type Color = PaletteToken | `#${string}`;
interface Style { stroke: Color; fill: Color|'none'; width: 1|2|4; dash: 'solid'|'dashed'|'dotted'; sketch?: 0|1|2; locked?: boolean; group?: Id; comments?: string[] }
interface NodeBase extends Style { id: Id; x?: number; y?: number; w: number; h: number; rot: number }
ShapeEl {type:'box'|'ellipse'|'diamond'|'cylinder'; label?; font?; size?}
TextEl {type:'text'|'note'; text; font?; size?; align?}
CodeEl {type:'code'; text; lang?}
FrameEl {type:'frame'; name; members: Id[]}
ImageEl {type:'image'; asset: string}
InkEl {type:'ink'; pts: InkPoint[]}                          // InkPoint = [x,y,pressure] relative to x,y
Connector extends Style {id; type:'arrow'; from: End; to: End; head:'end'|'both'|'none'; route:'straight'|'elbow'|'curve'; label?; via?: [number,number][]}
End = {id: Id} | {x: number; y: number}
Element = ShapeEl|TextEl|CodeEl|FrameEl|ImageEl|InkEl|Connector
Board = {version:1; sketch:0|1|2; bg?: Color; grid?: 'dots'|'lines'|'none'; elements: Element[]; trailingComments: string[]}
isNode(e), isConnector(e), defaultSize(type), STYLE_DEFAULTS, PALETTE, isColor(s), ID_RE, isValidId(s)
bounds(node): {x,y,w,h} | null   // null if unplaced; ink bounds come from its points
```

- [ ] Tests: `isValidId` accepts `api`, `api-2` and `~a8f3kq`, and rejects `Api`, `2a` and `~abc`. `defaultSize('box')` is `{w:160,h:80}`. `isColor` accepts `blue` and `#aabbcc` and rejects `#abc` and `purple`. `bounds` of an unplaced node is `null`.
- [ ] Implement, then run `pnpm vitest run packages/core`. Expected: PASS.
- [ ] Commit `core schema`.

### Task 3: format lexer

**Files:** `packages/format/src/lexer.ts` and `test/lexer.test.ts`.

**Produces:** `lexLine(src: string): {tokens: Token[]; error?: {col: number; message: string}}`, where `Token = {kind:'ident'|'string'|'number'|'at'|'size'|'colon'|'op'|'lbrace'|'rbrace'|'lparen'|'rparen'|'comma'|'eq'|'bare', text, value?, col}`.

- [ ] Tests:
  - `api: box "API \"v2\"" @-120,80 240x80 fill=blue` lexes the string value `API "v2"`, the position `-120,80` and the size `240x80`.
  - An unterminated string gives an error with its column.
  - `(10,-20)` is a free end point.
  - `<->`, `->` and `--` are ops.
  - `pts=Ab3_9-` is a bare value.
- [ ] Implement, test, and commit `format lexer`.

### Task 4: parser

**Files:** `packages/format/src/parse.ts` and `test/parse.test.ts`.

**Produces:** `parse(text: string): {board: Board; diagnostics: Diagnostic[]}`, where `Diagnostic = {line: number /*1-based*/; severity:'error'|'warning'; message}`.

**Rules:**
- **Header:** a missing or wrong header is an error, and the default board is used.
- **Bad lines:** a line that fails to parse is skipped and produces an error diagnostic. The other lines still load.
- **Duplicate ids:** an error. The first one wins.
- **Connector ids:** an id-less connector gets `from-to`. If that collides, it's an error telling the user to give the connector an explicit id. An id-less connector with a free end is an error too.
- **Dangling references:** a connector or frame member pointing to an unknown id is a *warning*, and the element is kept.

- [ ] Tests:
  - The example board from the spec parses into the expected elements.
  - Comments attach to the next element.
  - End-of-file comments go to `trailingComments`.
  - A bad line in the middle still loads the other lines.
  - The duplicate id and connector-collision cases produce diagnostics.
- [ ] Implement, test, and commit `board parser`.

### Task 5: ink codec + canonical serializer + round-trip property

**Files:** `packages/format/src/{ink.ts,serialize.ts,arbitrary.ts}`, `test/{ink.test.ts,serialize.test.ts,roundtrip.test.ts}` and `docs/format.md`.

**Produces:**

```ts
encodeInk(pts: InkPoint[]): string; decodeInk(s: string): InkPoint[]
serialize(board: Board): string
boardArb   // fast-check arbitrary: valid boards
```

**Ink encoding:** a flags byte (bit 0 = has pressure), then zigzag-varint deltas of x and y (integers), then pressure as a 0–255 byte when present, all encoded as base64url.

- [ ] Tests:
  - The ink codec round-trips, rounding coordinates to integers and pressure to 1/255.
  - `serialize` omits defaults and orders attributes canonically.
  - A connector whose id is `from-to` is written without the id.
  - Property: `parse(serialize(b))` has no errors, and `serialize(parse(serialize(b)).board) === serialize(b)`. Run 300 cases.
- [ ] Implement, test, and write `docs/format.md`, the user-facing format reference.
- [ ] Commit `canonical serializer`.

### Task 6: three-way merge

**Files:** `packages/format/src/{record.ts,merge.ts}` and `test/merge.test.ts`.

**Produces:**
- `mergeBoards(o: Board, a: Board, b: Board): {board: Board; conflicts: Conflict[]}`
- `mergeText(o: string, a: string, b: string): {text: string; conflicts: Conflict[]; diagnostics: Diagnostic[]}`
- `Conflict = {id: Id; prop: string; ours: unknown; theirs: unknown}`

**Rules:**
- **Properties:** merge per property, with ours winning a true conflict.
- **Delete vs edit:** if one side deleted an element and the other edited it, keep the edit and record a conflict with prop `deleted`.
- **Order:** start from our order, then insert elements that only theirs added after their nearest predecessor in theirs that's present in the result.
- **Header and trailing comments:** merged the same way.

- [ ] Tests (each one builds o, a and b with `parse`):
  - Edits to different elements combine. Edits to different properties of the same element combine.
  - The same property changed on both sides: ours wins and a conflict is recorded.
  - Deleted vs unchanged deletes the element. Deleted vs edited keeps it.
  - Elements added on both sides are all kept, in a sensible order.
  - `mergeText` output is canonical.
- [ ] Implement, test, and commit `three-way merge`.

### Task 7: semantic diff

**Files:** `packages/format/src/diff.ts` and `test/diff.test.ts`.

**Produces:**
- `diffBoards(a, b): Change[]`, where `Change = {kind:'added'|'removed', id, type} | {kind:'changed', id, props: {key, from, to}[]}`
- `formatChanges(changes): string[]`. The format collapses an x/y-only change to `moved api (+40,0)`.

- [ ] Tests: add, remove, move and relabel produce the expected lines.
- [ ] Commit `semantic diff`.

### Task 8: placement

**Files:** `packages/core/src/place.ts` and `test/place.test.ts`.

**Produces:**
- `placeUnpositioned(board): Board`, which returns a new board where every node has x and y. It's deterministic and never moves nodes that are already placed.
- `layeredLayout(board, dir:'LR'|'TB'|'RL'|'BT'): Board`, which places all nodes.

**`placeUnpositioned` rules:**
- **Connected to a placed node:** place the node 48 px right of (LR) or below that neighbour, stepping down until it doesn't overlap anything.
- **Leftover nodes:** place them in a grid row 96 px below the bounding box of the placed nodes.

**`layeredLayout` rules:**
- The rank is the longest path from a source, and the layout handles cycles.
- Ranks are separated by the widest node in the board plus 80 px. Nodes within a rank are spaced 48 px apart.

- [ ] Tests:
  - Placed nodes are unchanged.
  - A positionless `cache` connected from `api` lands to the right of `api` without overlapping.
  - Disconnected nodes go into a grid below everything else.
  - In a layered `a->b->c` chain with LR direction, x increases along the chain.
  - A cycle terminates.
- [ ] Commit `auto placement`.

### Task 9: SVG renderer

**Files:**
- `packages/render/src/{theme.ts,text.ts,shapes.ts,connectors.ts,svg.ts,index.ts}`
- `packages/render/test/svg.test.ts`

**Produces:** `renderSvg(board, opts?: {theme?: 'light'|'dark'; frame?: Id; padding?: number; assets?: (hash) => string | undefined}): string`. The function runs `placeUnpositioned` first.

**Clean style only.** Sketchy rendering arrives with the Canvas renderer plan; CLI output is clean for now.

**What gets drawn:**
- **Shapes:**
  - A box is a rounded rect. A diamond is a polygon. A cylinder is a path.
  - A note gets a filled background (default `yellow`).
  - A code element uses a mono font on a gray background.
  - A frame is a dashed rect with its name above it.
  - An image uses a data URI from `assets`, or a placeholder.
  - Ink is a perfect-freehand outline path.
- **Connectors:**
  - Endpoints are clipped to the shape boundary.
  - Routes are straight, elbow (three orthogonal segments) or curve (quadratic).
  - Arrowheads, and a label with a background at the midpoint.
- **Text:** approximate measurement in `text.ts` (0.6 em per character, 1.25 line height) shared with export.
- **Frame filter:** `frame` clips the output to that frame's bounds.

- [ ] Tests:
  - The output is well-formed (parsed with a tiny tag balance check), and the `viewBox` covers every element plus padding.
  - The text `<script>` is escaped.
  - A dark theme uses the dark palette value for `blue`.
  - The `frame` option filters elements to the frame's members.
  - A dangling connector end is skipped without throwing.
- [ ] Commit `svg renderer`.

### Task 10: importers (Mermaid flowchart subset, Excalidraw)

**Files:** `packages/format/src/import/{mermaid.ts,excalidraw.ts}` and `test/import.test.ts`.

**Produces:**
- `fromMermaid(src): {board; diagnostics}`
- `fromExcalidraw(json: unknown): {board; diagnostics}`

**Mermaid support:**
- `flowchart|graph LR|TD|TB|RL|BT`.
- Node shapes: `A`, `A[x]`, `A(x)`, `A((x))`, `A{x}`, `A[(x)]`.
- Edges: `-->`, `---`, `-.->`, `==>`, `-->|label|`, `-- label -->`, and chains.
- Node ids are slugified to valid ids. Placement uses `layeredLayout`.
- Unsupported lines produce warnings.

**Excalidraw mapping:**
- `rectangle` → box, plus ellipse and diamond.
- Bound text (via `containerId`) becomes the container's label. Free text becomes a text element.
- `arrow` and `line` use their bindings when present and free ends otherwise.
- `freedraw` → ink. A `frame` keeps its members from `frameId`.
- Images are skipped with a warning. Deleted elements are dropped.
- Ids are converted to `~` plus a 6-character hash.
- Colours map to the nearest palette token if close, otherwise they stay as hex.
- `roughness` maps to `sketch`, and the board default is the most common value.
- `angle` maps to `rot` in degrees.

- [ ] Tests: fixture inputs produce the expected elements, the output of both importers serialises and re-parses cleanly, and unsupported input produces warnings.
- [ ] Commit `mermaid and excalidraw import`.

### Task 11: dbm CLI

**Files:** `packages/cli/src/{main.ts,commands/*.ts,io.ts}`, `packages/cli/tsup.config.ts` and `packages/cli/test/cli.test.ts`.

**Produces:**
- The `dbm` binary with: `render <file> -o <out.svg|out.png> [--theme] [--frame]`, `fmt [--check] <files…>`, `check <files…>`, `merge <O> <A> <B>`, `diff <old> <new>`, `init`, `from-mermaid <in> [-o]`, `from-excalidraw <in> [-o]`.
- Exit codes: 0 means OK, 1 means problems found (`--check` / `check`), 2 means a usage or IO error.

**Behaviour:**
- **merge:** writes the result to A and prints conflicts to stderr. It exits 0 unless a file fails to parse fatally.
- **init:** adds `*.board merge=dbm` to `.gitattributes` without duplicating it, and sets `merge.dbm.name` and `merge.dbm.driver` in the local git config.
- **Size cap:** files over 20 MB are refused.

- [ ] Tests (run the commands in-process against a temp dir):
  - `fmt --check` flags a non-canonical file, and `fmt` fixes it.
  - `check` reports dangling refs.
  - `render` writes an SVG, and a PNG with a valid PNG signature.
  - `merge` writes the merged result into A.
  - `from-mermaid` round-trips.
- [ ] Commit `dbm cli`.

### Task 12: end-to-end git merge driver test + README

**Files:** `packages/cli/test/git-e2e.test.ts` and `README.md`.

- [ ] Test:
  1. Build the CLI with tsup, then `git init` a temp repo and run `dbm init` (driver pointed at `node <abs>/dist/dbm.js`).
  2. Commit a board. Branch A moves `api`; branch B relabels `api` and adds `queue`.
  3. `git merge`. Expected: it succeeds, the file contains no `<<<<<<<` markers, and it holds both changes in canonical form.
- [ ] Update the README with what the project is, the CLI usage and the git setup.
- [ ] Commit `git merge e2e and readme`.
