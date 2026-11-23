# drawboardmafia — product spec and execution plan

Status: draft for review · Date: 2026-11-24 · Owner: solo developer

Evidence base: [docs/research/2026-11-24-whiteboard-landscape.md](../../research/2026-11-24-whiteboard-landscape.md). Claims tagged `[R§n]` point to a section of that report, where the primary sources are cited.

Decisions already made with the owner:

| Decision | Choice |
|---|---|
| Deployment model | Local-first in the browser, plus collaboration through a share link over a relay. No accounts. |
| Visual identity | Clean vector shapes by default, with a per-board or per-element "sketchy" toggle using rough.js. |
| Novel features | (1) Two-way diagram-as-code. (2) Git-native board files. |
| How boards reach disk | The browser opens a folder (File System Access API) and saves into it, falling back to download/upload elsewhere, plus a Node CLI. |
| Architecture | A custom Canvas2D engine, per-property last-writer-wins sync, and an end-to-end encrypted relay on Cloudflare Durable Objects. |

---

## 1. Product vision and positioning

**One line:** A whiteboard where the drawing *is* a text file. You can sketch it, type it, diff it, merge it and share it live, all without an account.

**Who it's for:** Developers and technical teams who draw architecture diagrams, flows, sequence sketches and whiteboard-style explanations, and who want those drawings to live **in the repo next to the code**: reviewed in PRs, rendered in READMEs, and editable by both humans and agents.

**Positioning against the field:**

- **Excalidraw** is the hand-drawn, ephemeral sketchpad. We are durable, cleaner by default, and git-native. We import `.excalidraw` files so switching costs nothing.
- **tldraw** is a commercial SDK: its editor needs a license key and is "not open source by any definition" `[R§1, R§4]`. We are MIT end to end.
- **Mermaid and D2** are text-only, and their layout is out of your hands. We give you the text *and* direct manipulation, and manual positions survive edits to the code. D2 Studio is the only tool that edits both ways, and it is closed and commercial `[R§7, R§9a]`.
- **Miro and FigJam** are heavyweight SaaS with AI everywhere. We are local-first, open source, and have **no built-in AI**. Agents use our CLI and MCP against plain files `[R§9h]`.

**Product principles (in priority order when they conflict):**

1. **Never lose work and never surprise.** Saves are automatic. Opening a file never changes its bytes. Undo always works.
2. **Fast is a feature.** Input-to-ink latency under one frame, 60 fps pan and zoom on 10k-element boards.
3. **The keyboard is first-class, the pointer equally so.** Everything is reachable by keyboard, and nothing *requires* the keyboard.
4. **Plain text is the source of truth on disk.** Every feature must serialise cleanly to the `.board` format, or it doesn't ship.
5. **Calm UI.** Minimal chrome, no badges or upsells, comfortable dark and light themes for long sessions.

**Non-goals, stated so scope stays honest:** accounts and workspaces, built-in AI UI, comment threads, mobile-first UI, 100k+ element boards, a general-purpose design tool (no vector boolean ops, no components or variants).

---

## 2. Competitive analysis and identified gaps

The full table and citations are in `[R§1–R§2, R§10]`. The gaps that matter for us, with the strongest evidence first:

| Gap | Evidence | Our response |
|---|---|---|
| Rich text, code blocks, tables and LaTeX in an open-source whiteboard | Excalidraw's top open requests add up to more than 1,000 reactions. Tables is #1 at 327 `[R§2]`. | MVP: a **code-block element** with syntax highlighting (cheap for us, since we already ship Lezer). V2: Markdown-lite text, tables, KaTeX. |
| Local-first, git-friendly files plus collaboration | 131 upvotes for GitHub rendering. VS Code extension files churn just from being opened. Self-hosting collab has been open since 2020 (136 reactions) `[R§9f]` | **Novel feature 2.** |
| Two-way diagram-as-code | Every open-source path is one-way (Mermaid to canvas). Only the closed D2 Studio round-trips `[R§9a]`. | **Novel feature 1.** |
| Easy self-hosting with collaboration | Excalidraw needs a client, excalidraw-room, a JSON store and Firebase `[R§10]` | One Worker plus one Durable Object, deployed with `wrangler deploy`. A Node relay for self-hosting comes in V2. |
| Remappable, layout-independent keyboard control | #3852 (38), #3059, #6925 (vim), #7685 `[R§9b]` | A keymap based on `KeyboardEvent.code`, user-editable, with single-key shortcuts that can be switched off. |
| Scale beyond about 5–10k elements | Excalidraw has no spatial index (#10512). tldraw caps a page at 4k shapes `[R§3, R§4]` | An R-tree, level of detail, and a bitmap cache. This is an engineering standard, **not marketed as a feature**. |
| Free presentation mode and PDF export | Paywalled in Excalidraw+ `[R§9i]` | V2. |
| Screen-reader access to canvas content | Excalidraw's canvas is invisible to assistive tech (#5759) `[R§8]` | The DSL pane doubles as an accessible text view of the diagram (see §5). |

**Ideas rejected and why:**

- **Keyboard flowcharting as a "novel" feature.** Excalidraw, tldraw, Whimsical, draw.io and Miro already ship it `[R§9b]`. It's table stakes, so we ship it well, but it isn't a differentiator.
- **100k-element performance as a headline.** Few people ask for it `[R§9e]`. We engineer for headroom but don't lead with it.
- **Time-travel and branching inside the app.** The evidence is weak `[R§9c]`, and git already provides history once boards are files. It comes for free from novel feature 2 (`git log`, `git diff` with our diff driver).
- **Built-in AI.** There's active backlash `[R§9h]`. The agent-facing MCP and CLI cover the real need without UI clutter.
- **Live code execution and embeds.** Niche, and Observable and tldraw office already occupy that space `[R§9g]`.
- **Forking Excalidraw.** We'd inherit its sketchy-first renderer, missing spatial index and per-element conflict resolution, and pay a permanent tax maintaining the fork.
- **Building on the tldraw editor.** The licence rules it out. Its MIT `@tldraw/state` *is* used.

---

## 3. The two novel features

### 3.1 Two-way diagram-as-code ("the file is the code")

**Problem.** Today you choose between *text* diagrams (Mermaid or D2: diffable and agent-friendly, but you can't nudge a box) and *canvas* diagrams (Excalidraw: direct and pleasant, but opaque JSON that churns). Converting is one-way and destroys the layout. Teams keep both versions, and they drift.

**What it does.** A toggleable side pane (`Cmd+/`) shows the board as text in a compact DSL. Editing either side updates the other live:

```
board 1
// Checkout flow
api: box "API Gateway" @120,80 240x80 fill=blue
db: cylinder "Postgres" @520,80
cache: box "Redis"                      // no position: auto-placed
api -> db "reads" route=elbow
api -> cache dash=dotted
f1: frame "Checkout" @80,40 700x300 { api db cache }
~a8f3kq ink @300,400 pts=Ab3_9fQ…       // freehand: opaque but stable
```

- **Canvas to text:** drag a node and only its `@x,y` token changes in the pane. The cursor and the scroll position in the pane are preserved.
- **Text to canvas:** type `queue: box "SQS"` and `api -> queue`, and a node appears, auto-placed next to its connected neighbour. Rename a label and the canvas updates. Delete a line and the element is deleted (with undo).
- **Fold positions:** a pane toggle hides the `@…` and `WxH` tokens using CodeMirror decorations, so the text reads like Mermaid while the positions stay in the file.
- **Paste Mermaid** (flowchart subset) on the canvas or into the pane to convert it.

**Why it isn't a gimmick.**

- It's the same artefact, so nothing drifts.
- Agents and scripts edit boards with plain string operations, with no SDK needed.
- PR reviews show readable diffs, and the pane is the accessible view of the diagram.
- The demand signals are modest in reaction counts but consistent: the agent round-trip gap (tldraw #11151), Mermaid paste requests, and Excalidraw shipping its own CLI and MCP `[R§9a]`.

**Implementation approach.**

1. **Grammar.** A Lezer grammar in `packages/format/board.grammar` gives an incremental, error-tolerant parse tree shared by the editor (highlighting and folding) and the loader. Node IDs are `[a-z][a-z0-9_-]*` for named elements. Unnamed elements get a `~` plus a 6-character base36 random ID.
2. **Canonical serializer.** It's deterministic: integer coordinates, fixed attribute order, default values omitted, and one element per line. Lines are ordered by the element's fractional z-index. Keys never change unless the element is restacked, so inserting an element adds a line without moving the others. Children of a frame are listed in its `{ }` member list, not nested, so lines never move when you re-parent an element.
3. **Text to canvas.** On a debounced parse (100 ms), build an `id → attrs` map. Diff it against the store's current projection, then emit property-level ops through the same op pipeline as canvas edits, so collab and undo come for free.
   - **Error rule:** a line with a syntax error never causes a deletion. Its element keeps its last good state and the line gets an error underline.
   - **Deletions:** only a line that is *absent* from a parse that otherwise succeeded counts as a deletion.
4. **Canvas to text.** On a store change, re-serialise only the changed elements and apply minimal CodeMirror changes, mapping selections through them.
   - **Typing protection:** while the pane has focus and the user typed in the last 750 ms, incoming canvas changes to *the line under the cursor* are held back and applied when typing goes idle. This avoids the cursor-fighting problem.
5. **Auto-placement for positionless nodes.**
   - **Connected to a positioned node:** place it right of or below that neighbour, using the existing graph direction, with a 48 px gap and collision avoidance through the R-tree.
   - **Unconnected:** place it in the next free slot of a grid below the board's bounding box.
   - **Pinning:** the computed position is written back into the file, so it becomes stable.
   - **Explicit "tidy selection" (V2):** a command runs **dagre** (MIT, 16 kB gz; elkjs is EPL and 447 kB, so it's rejected `[R§9d]`), lazy-loaded.
6. **Lossless guarantee.** Property tests (fast-check) assert `serialize(parse(serialize(board))) === serialize(board)` and `parse(serialize(b)) ≅ b` for generated boards. This is the foundation of both novel features.

**MVP cut.** Two-way for boxes, ellipses, diamonds, cylinders, text, notes, code blocks, arrows (from, to, label, route, style), frames and styles. Ink, images and groups are represented in the file but shown in the pane as opaque lines; editing those lines is allowed, but it isn't the point.

### 3.2 Git-native boards

**Problem.** Whiteboards are where design decisions get made, then they rot in a SaaS account. When teams do commit `.excalidraw` JSON, they get huge diffs, merge conflicts on every edit, and churn just from opening the file `[R§9f]`.

**What it does.**

- **A `.board` text file** (§3.1), plus a sibling `name.board.assets/` folder for images, named by content hash `sha256.png` so they deduplicate and diff well.
- **Open folder** (`Cmd+O`, Chromium only): pick a directory such as your repo's `docs/diagrams`. The sidebar lists the `.board` files in it, edits save straight back to disk (debounced 500 ms, atomic writes), and changes made outside the app (`git pull`, an agent editing the file) are detected and **merged**, not overwritten.
- **`dbm` CLI** (`npm i -g drawboardmafia`):

  | Command | What it does |
  |---|---|
  | `dbm render <file> -o out.svg\|png [--frame <id>] [--theme dark]` | Renders a board for READMEs and docs. |
  | `dbm fmt [--check]` | Rewrites files to canonical form. `--check` makes CI fail on non-canonical files. |
  | `dbm check` | Validates schema and references (dangling arrow ends, unknown frame members). |
  | `dbm merge %O %A %B` | A **git merge driver**: a three-way merge per property. |
  | `dbm diff` | A **textconv / diff driver** that gives a semantic summary, for example "moved api (+40,0); added queue; relabelled api→db". |
  | `dbm init` | Writes the `.gitattributes` lines (`*.board merge=dbm diff=dbm`) and the git config. |
  | `dbm from-mermaid`, `dbm from-excalidraw` | Converters for importing existing diagrams. |

- **Zero-churn guarantee.** Opening a file and closing it again leaves its bytes untouched. The app writes only after a user edit, and only the canonical form. If a file on disk is non-canonical, it isn't rewritten until the user edits it.

**Why it isn't a gimmick.** This is the best-evidenced gap in the research `[R§10]`. tldraw office, the closest product, explicitly does not merge external or git changes `[R§9f]`. Making the file format our own (approach A) is what makes this possible, and it's the reason we didn't pick Yjs.

**Implementation approach.**

- **Line-based layout does most of the work.** Concurrent edits to *different* elements touch different lines, so git's own merge usually succeeds with no driver at all. The driver handles same-line conflicts.
- **Merge algorithm** (`packages/format/merge.ts`): parse O, A and B; build maps keyed by ID; for each ID, merge property by property.
  - A property changed on only one side: take that change.
  - Changed on both sides to the same value: take it.
  - Changed on both sides to different values: take ours, record a conflict, and print a warning.
  - **Deletes:** if one side deleted an element and the other edited it, keep the edit and warn.
  - **z-order:** fractional index keys merge as plain property values, and collisions are broken by ID.
  - **Output:** canonical text, with exit code 0, so the merge never leaves conflict markers inside a board.
- **External change detection in the app.**
  - **Detect:** on window focus, and every 2 s while visible, compare the file's `lastModified` and size through the handle. Use `FileSystemObserver` instead where the browser supports it.
  - **Merge:** if the file changed, run the same three-way merge with **base = last content we read or wrote** (stored in IndexedDB per file), A = the in-memory board, B = the disk content.
  - **Apply:** apply the result as ops, so collaborators see it too.
- **Non-Chromium browsers.** Firefox and Safari have no `showDirectoryPicker`. Boards live in IndexedDB, and Export/Import (`.board` download and upload) plus the CLI cover the git workflow. The limitation is shown honestly in the UI.

---

## 4. Feature scope

### MVP (v0.1, the public launch)

**Canvas and editing**
- An infinite canvas: pan with space-drag, middle-mouse or trackpad, and pinch or `Cmd`+wheel to zoom from 10% to 3200%. Zoom to fit (`Shift+1`) and to selection (`Shift+2`).
- Selection (click, `Shift`-click, marquee, `Cmd+A`), move, resize, rotate, nudge with the arrow keys (1 px, or 10 px with `Shift`).
- Snapping: to other objects' edges and centres, with equal spacing guides, and optionally to the grid. Holding `Alt` while dragging overrides snapping temporarily.
- Group and ungroup, lock and unlock, z-order, duplicate (`Cmd+D`), align and distribute.
- Undo and redo are per-user and local. In collaboration you undo only your own operations.

**Element types**
- Box, ellipse, diamond and cylinder, each with a label.
- Text, sticky note, and **code block** (monospace, syntax highlighting through Lezer language packs, lazy-loaded).
- Arrow and line: straight, elbow and curved. Arrows **bind** to shapes and keep their binding through moves, with arrowhead styles and labels on the arrow.
- Freehand ink: perfect-freehand with pressure. The eraser deletes whole strokes or elements.
- Frame: named, clips its content, and is the unit for export and for `--frame`.
- Image: paste or drag in, stored as assets addressed by hash.

**Styling**
- An 8-colour palette, tuned for both light and dark themes, plus a custom hex value.
- Stroke width (3 steps), dash (solid, dashed, dotted), fill (none, solid, hachure when sketchy).
- Font (sans, mono, hand) with 4 sizes.
- Sketchy level (0, 1, 2) per board, with a per-element override.

**Persistence and I/O**
- IndexedDB autosave, the board sidebar, **Open folder** and the `.board` format.
- Export PNG, SVG and the clipboard (PNG, plus SVG where supported), with optional embedded `.board` source in the PNG `tEXt` chunk and the SVG `<metadata>` so exports re-import losslessly.
- Import `.board`, `.excalidraw` and Mermaid (flowchart subset).

**Novel features**
- The two-way DSL pane, cut as described in §3.1.
- The `dbm` CLI: `render`, `fmt`, `check`, `merge`, `diff`, `init`, plus both importers.

**Collaboration**
- Share link (`Cmd+Shift+S`) creating an end-to-end encrypted room.
- Live cursors with names and colours, selection highlights, "following" a user's viewport, and a presence avatars strip.
- An offline queue, then catching up on reconnect.

**Keyboard**
- Command palette (`Cmd+K`) with fuzzy search over every command and its shortcut.
- Single-letter tool keys that can be disabled. Remappable keymap JSON stored in the settings file.
- Structural navigation: `Tab`/`Shift+Tab` walk through shapes in reading order; `Alt+Arrow` jumps to the connected or nearest neighbour; `Cmd+Arrow` creates a connected node; `Enter` edits the label; `Esc` goes up a level; `/` opens quick insert.

**Comfort and accessibility**
- Light, dark and high-contrast themes, following the system by default.
- Reduced motion, a zen mode (`Alt+Z`) that hides the chrome, and dot, line or no grid.
- The accessibility baseline in §5.

### V2

- **Rich text:** Markdown-lite in text, notes and labels (bold, italic, code, links, lists, highlight colour), using a DOM editor overlay. Plus **tables** and **KaTeX** math. This answers the most-requested item cluster `[R§2]`.
- **Presentation mode:** frames become slides, with PDF export for all frames. Ships free.
- **Read-only share links:** an Ed25519 write key in edit links only. The relay checks signatures against the public key registered when the room is created.
- **MCP server:** `dbm mcp`, with tools to list, read, add, update and delete elements and render a board, working on files through `core`.
- **A GitHub Action** that renders changed `.board` files to SVG and comments on the PR with before/after images.
- **Self-host relay:** the same relay logic on Node `ws` with SQLite, shipped as one Docker image.
- **Plugin API:** `defineElement({ type, schema, render, hitTest, toText, fromText })` and `defineCommand`.
- **Smaller additions:** tidy-up layout (dagre) on demand, the full Mermaid flowchart and sequence import, Mermaid export, a laser pointer, multi-page boards, and a template and shape library.

### Future (only if pulled by real usage)

- A Tauri desktop app (file access on every OS), and a VS Code custom editor for `.board` files.
- Peer-to-peer WebRTC collaboration with the relay as a fallback.
- A visual board diff (before/after overlay between two git revisions).
- A WebGL renderer, only if profiling shows Canvas2D is the bottleneck.
- A mobile-optimised UI. Pen-first improvements beyond the basics.

---

## 5. UX/UI principles and key interaction flows

### Principles

1. **The canvas owns the screen.** The chrome is a slim top bar (file name, share, presence), a floating tool dock at the bottom centre, and a contextual style bar that appears only when something is selected. Panels (the DSL pane and the board sidebar) are toggled and remember their state.
2. **Modeless where possible, explicit where needed.** After you create a shape, the tool returns to select (with a `Q` toggle to keep the tool locked). Drawing ink is the exception: it stays in ink mode until `Esc` or `V`.
3. **Every action has three entry points.** A direct manipulation, a shortcut, and a palette command. The palette lists each command's shortcut, which is how people discover them.
4. **Instant feedback, no gratuitous motion.** No animations on keyboard actions. Camera moves animate (150 ms ease-out) only for zoom-to-fit and follow, and are instant under reduced motion.
5. **Comfort for long sessions.**
   - **Dark theme:** the canvas is not pure black (`#16171a`) and the ink isn't pure white.
   - **Light theme:** the canvas is not pure white (`#fbfbfa`).
   - **Colours:** the palette is re-tuned per theme, not inverted. An element stores a palette *token* (`blue`), not a hex value, so the same board looks right in both themes.
6. **No modal dialogs for routine work.** Export, share and settings are popovers. The only blocking prompt is a destructive action that can't be undone, and almost nothing is like that.

### Key flows

**F1 — First run (no sign-in, under 5 s to first stroke)**

1. Open the app and see a blank board immediately, with a one-line hint: "Press `/` to insert, `Cmd+K` for commands, or just draw."
2. Draw. The board autosaves to IndexedDB, named "Untitled — Nov 24".

**F2 — Keyboard-only architecture diagram**

1. `/` → type "box" → `Enter`. A box appears at the viewport centre in label-edit mode. Type "API" → `Esc`.
2. `Cmd+→` creates a connected box to the right, already bound to the arrow and in edit mode. Type "DB" → `Esc`.
3. `Alt+←` moves back to API. `Cmd+↓` creates another connected node below.
4. `Cmd+/` opens the DSL pane, where all three nodes appear as text. Rename one in text and the canvas updates.

**F3 — Diagram in the repo (Chromium)**

1. `Cmd+O` → choose `repo/docs/diagrams`. The sidebar lists the boards; open `checkout.board` and edit it. It saves to disk.
2. In the terminal, run `git diff` to get a readable, line-level diff, or `dbm diff` for a semantic summary.
3. A teammate's change arrives through `git pull`. The app detects it on focus, merges, and shows a toast: "Merged external changes (3 elements)", with undo.
4. Add `dbm render docs/diagrams/checkout.board -o checkout.svg` to the docs build.

**F4 — Live session**

1. `Cmd+Shift+S` → "Start live session". The URL `…/#room=<id>&k=<key>` is copied, and a popover explains that whoever has the link can edit.
2. A guest opens the link and sees cursors. Clicking an avatar follows that person's viewport, and the first pan stops following.
3. When the session is linked to an open-folder file, the host's app keeps writing to disk. Guests hold an in-browser copy that they can "Save as…".

**F5 — Conflict while typing a label.** While someone edits a text element, others see a soft-lock outline with that person's name. They can still force-edit it, and if they do, the last writer wins on the whole string. This is an accepted limitation (see §10).

### Accessibility baseline (MVP)

- **Screen readers:**
  - **Structure:** the canvas element has `role="application"` and a live region announces selection changes: "Box 'API', connected to DB and Cache, 2 of 14".
  - **Text view:** **the DSL pane is a real CodeMirror text editor**, so it is the screen-reader view of the whole diagram, a stronger story than any competitor has `[R§8]`.
- **Keyboard:** all of §4's keyboard features. Visible 2 px focus rings on the chrome. A selection outline at least 3:1 against the canvas.
- **WCAG 2.2:**
  - **2.1.4 Character Key Shortcuts:** single-key shortcuts can be switched off or remapped.
  - **2.5.7 Dragging Movements:** every drag has a keyboard or command alternative (nudge, the `Cmd+Arrow` connector, "Move to…" in the palette).
  - **2.5.8 Target Size:** chrome targets are at least 24×24 px.
  - **1.4.11 Non-text Contrast:** checked for every UI element.
  - Respect `prefers-reduced-motion` and `prefers-contrast`.
- **Auditing:** each milestone gets an axe-core run in Playwright, plus a manual VoiceOver pass before launch.

---

## 6. Tech stack and architecture

| Layer | Choice | Why |
|---|---|---|
| Language and build | TypeScript (strict), pnpm workspaces, Vite, Vitest, Playwright | Standard, fast, and one language for the app, the relay and the CLI. |
| UI chrome | React 19 | Only for panels, toolbars and popovers. **The canvas never re-renders through React.** |
| Reactive state | `@tldraw/state` (MIT signals) `[R§4]` | Fine-grained computed values (selection bounds, visible set) without React overhead. Fallback: `@preact/signals-core`. |
| Canvas rendering | Canvas2D, with our own renderer | Simplest path to high quality. WebGL isn't needed at our scale target `[R§6]`. |
| Spatial index | `rbush` | Queries "hundreds of times faster" than a linear scan `[R§6]`. |
| Strokes | `perfect-freehand` (2 kB) | The industry standard `[R§6]`. |
| Sketchy style | `rough.js` (9 kB, lazy-loaded) | It's in maintenance mode `[R§6]`. Acceptable, since it's small enough to vendor if it ever needs a fix. |
| Ordering | `fractional-indexing` (with jitter) | Stable z-order keys that merge cleanly. |
| Text pane and grammar | CodeMirror 6 + Lezer (lazy-loaded) | Incremental, error-tolerant parsing that is shared with the loader and the CLI. |
| Local storage | IndexedDB (via `idb`), the File System Access API | Local-first. |
| Relay | Cloudflare Worker + one Durable Object per room, with hibernating WebSockets | About $0 at hobby scale `[R§5]`. |
| Encryption | WebCrypto AES-GCM-256 | Native and dependency-free. |
| CLI rendering | The shared SVG renderer, plus `@resvg/resvg-js` for PNG | No headless browser needed in CI. |
| Layout (V2) | `dagre`, lazy-loaded | MIT and small `[R§9d]`. |

### Packages

```
packages/
  core/      element schema, store (signals), ops, HLC clocks, history (undo), geometry, hit-testing, bindings
  format/    Lezer grammar, parse/serialize (canonical), 3-way merge, semantic diff, importers (excalidraw, mermaid)
  render/    scene → Canvas2D renderer AND scene → SVG string renderer (shared shape geometry, no DOM dependency)
  app/       React chrome, tools/state machines, input pipeline, DSL pane, persistence adapters, collab client
  relay/     protocol types + Durable Object implementation (V2: Node adapter)
  cli/       dbm — uses core + format + render
```

**Dependency rule:** `core` depends on nothing UI-related. `format` and `render` depend only on `core`. `app` and `cli` sit at the top. This is what lets the CLI, the future MCP server and tests run everything headlessly.

### Engine internals

- **Input pipeline.** Pointer events go through `getCoalescedEvents()` to a **tool state machine**. Each tool (select, box, arrow, ink, …) is a small explicit state machine with states such as idle, pointing, dragging and editing, which is easy to test. Tools emit *intents*, and intents become ops.
- **Two canvases.** The **scene canvas** redraws only when the scene or the camera changes. The **overlay canvas** holds selection, handles, cursors, snap guides and **the active ink stroke**. Ink is drawn on the overlay on every coalesced event, and the context is created with `desynchronized: true` where supported, for low latency.
- **Text editing.** A positioned DOM `<textarea>` (later a contenteditable for rich text) sits over the element while you edit, so the browser handles IME, spellcheck and accessibility. Committed text is drawn on the canvas. Text is measured with `measureText` plus a per-font line-metrics cache, and the SVG renderer reuses the same metrics, so exports match the canvas.

---

## 7. Data model, collaboration and real-time sync

### Element schema (`core/schema.ts`)

```ts
type Id = string;               // "api" (named) or "~a8f3kq" (anonymous)
type Z = string;                // fractional index key
type ColorToken = 'ink'|'gray'|'red'|'orange'|'yellow'|'green'|'blue'|'violet' | `#${string}`;

interface Base {
  id: Id; type: ElementType; z: Z;
  x: number; y: number; w: number; h: number; rot: number;      // integers on disk except rot (1 dp)
  stroke: ColorToken; fill: ColorToken | 'none'; width: 1|2|4; dash: 'solid'|'dashed'|'dotted';
  sketch?: 0|1|2;               // undefined = board default
  locked?: true; group?: Id;    // groups are flat ids; nested groups = V2
  meta?: Record<string, Json>;  // plugin namespace, serialized as meta.key=json
  deleted?: true;               // tombstone (in-memory/sync only; never written to .board)
}
type Shape = Base & { type: 'box'|'ellipse'|'diamond'|'cylinder'; label?: string; font?: Font; size?: 1|2|3|4 };
type Text  = Base & { type: 'text'|'note'; text: string; font?: Font; size?: 1|2|3|4; align?: 'l'|'c'|'r' };
type Code  = Base & { type: 'code'; text: string; lang?: string };
type Arrow = Base & { type: 'arrow'|'line'; from: End; to: End; route: 'straight'|'elbow'|'curve';
                     via?: [number, number][]; head?: Heads; label?: string };
type End   = { id: Id; anchor?: [number, number] } | { x: number; y: number };   // bound or free
type Ink   = Base & { type: 'ink'; pts: string /* delta-encoded int16 x,y,pressure → base64url */ };
type Frame = Base & { type: 'frame'; name: string; members: Id[] };
type Image = Base & { type: 'image'; asset: string /* sha256 */; crop?: [number,number,number,number] };
```

**Board metadata** (first line plus a header line): format version, default sketch level, background, grid.

**Design notes:**
- **Arrows are elements with endpoint references, not parent and child links.** Deleting a node leaves a free arrow end at its last position, which is the same behaviour as Excalidraw.
- **Frames list their members.** Membership is a property on the frame, so moving an element into a frame changes one line, the frame's.
- **Named IDs are user-facing.** They're generated as slugs from the first label (`api`, `api-2`) when a shape gets a label. Renaming the label does **not** change the ID, so references stay stable. Renaming the ID is an explicit palette command that rewrites references.

### Operations and conflict resolution

- **The op is the unit of sync, undo and persistence.**
  `Op = { id: Id, p: PropPath, v: Json | undefined, t: HLC }`, where `HLC = wallMs:counter:clientId`, compared lexicographically.
- **Per-property last-writer-wins.** Each element keeps a clock per property (`clocks: Map<PropPath, HLC>`) in memory and in IndexedDB, but **never in the `.board` file**. An incoming op applies when `op.t > clocks[p]`.
  - This fixes Excalidraw's per-element version check, which drops one of two concurrent edits even when they touch different properties `[R§3]`.
- **Creation and deletion.** Creating an element is a batch of ops that includes `deleted: undefined`. Deleting is `deleted: true` as an ordinary last-writer-wins property. Tombstones are pruned from storage after 30 days with no ops, and never serialised to the file.
- **Transactions.** A user gesture, such as a drag, produces many ops. They are grouped into one **transaction** for undo, and the network side coalesces them per animation frame, sending only the latest value per property.
- **Undo** is a local stack of inverse transactions holding the previous values. Undo issues *new* ops with fresh timestamps, so in collaboration it only reverts your own changes, and if someone else has since changed a property, your undo of it still applies. This is documented behaviour.
- **Text.** Labels and text bodies are last-writer-wins on the whole string, with the soft-lock presence described in F5. Character-level text merging is explicitly out of scope.
  - **Upgrade path if it hurts:** Yjs `Y.Text` for text bodies only, behind the same op interface.

### Relay protocol (`relay/`)

- **Room setup.**
  - **Room ID:** 128-bit random, base64url.
  - **Key:** a 256-bit AES-GCM key generated on the client, which lives only in the URL fragment (`#room=…&k=…`), so it never reaches the server `[R§3]`.
- **Messages** (WebSocket, binary):
  - `hello{room, since}`
  - `ops{seq?, iv, ciphertext}`: a batch of ops, encrypted.
  - `presence{iv, ciphertext}`: cursor, selection, viewport, name, colour, editing ID. Throttled to 20 Hz, never stored.
  - `snapshot{seq, iv, ciphertext}`
- **The Durable Object** assigns a monotonic `seq` to each `ops` message, fans it out, and appends it to storage. Because the server can't read anything, **clients compact**:
  - **Snapshotting:** after 500 ops, or when the last client leaves, a client uploads an encrypted full snapshot tagged with the seq it covers. The DO then drops the ops before that seq.
  - **Late joiners** get the snapshot plus the tail of ops after it.
  - **Expiry:** rooms expire after 30 days of inactivity.
- **Offline and reconnect.** Ops made while offline are queued in IndexedDB. On reconnect, the client sends `hello{since: lastSeq}`, receives what it missed, then flushes its queue. Last-writer-wins with HLC makes ordering irrelevant.
- **Limits enforced by the DO:**
  - **Size:** 256 kB per message. Images go as a separate `asset` upload, encrypted and capped at 5 MB each and 50 MB per room.
  - **Rate:** 200 msgs/s per connection.
  - **People:** 50 connections per room.

### Persistence layers

| Where | What | When |
|---|---|---|
| IndexedDB `boards` | Elements plus clocks, per board | Every transaction (batched per 250 ms) |
| IndexedDB `files` | A file handle plus the last-synced text (the merge base) | Opening or writing a folder file |
| Disk `.board` | Canonical text | 500 ms after the last edit, written atomically (`createWritable` → write → close) |
| Durable Object | Encrypted snapshot plus the op tail | Live sessions only |

---

## 8. Performance, security and scalability

### Performance budgets (checked in CI from M1 onwards)

Reference hardware is an M1 MacBook Air with Chrome, plus a 2019 mid-range Windows laptop for spot checks.

| Metric | Target |
|---|---|
| Pan and zoom, 10k mixed elements | 60 fps (frame time p95 under 16 ms) |
| Pan and zoom, 50k elements | Above 30 fps, with level of detail on (a stretch goal, not marketed) |
| Pointer to ink pixel | At most 1 frame (overlay canvas, coalesced events) |
| Open a 5k-element board | Under 300 ms to first paint |
| Op apply, 1k-element remote batch | Under 8 ms |
| Initial JS (gzipped) | Under 250 kB. CodeMirror, Lezer, rough.js, dagre and the importers load lazily. |
| Parse and serialise a 5k-line `.board` file | Under 50 ms |

**Techniques:**
- **Rendering:**
  - **Culling:** viewport culling through `rbush`.
  - **Caching:** a `Path2D` and geometry cache per element, keyed by a version counter, plus a bitmap cache for expensive elements (sketchy shapes, ink, code blocks) at quantised zoom levels.
  - **Level of detail:** below 30% zoom, text renders as grey bars, sketchy renders as clean, and ink renders as a simplified polyline.
- **Work scheduling:**
  - **Spatial index:** incremental R-tree updates during drags, done only on drop, while the dragged set is drawn from the overlay.
  - **Op application** stays off the render path. Rendering is scheduled with `requestAnimationFrame`, and redrawing happens only when a dirty flag is set.
- **Benchmarking:** a dedicated `bench/` page generates boards of N elements and records frame times through Playwright tracing. A regression above 10% fails CI.

### Security

- **End-to-end encryption.** The relay sees only room IDs, sizes, timing and IP addresses. This is documented honestly.
  - **Link leakage:** the key in the fragment can leak through browser history, screenshots and chat logs, so the UI calls the link "anyone with this link can edit".
- **Untrusted input everywhere.** Imported `.board`, `.excalidraw`, Mermaid and pasted content all go through the schema validator.
  - Text is **never** interpreted as HTML.
  - SVG export escapes all text, and imported SVG images are rasterised, not inlined.
  - The Content-Security-Policy is `default-src 'self'` and allows `wss:` only for the relay.
- **Not allowed in MVP:** arbitrary iframe embeds. When embeds arrive (V2 or later), they get sandboxed iframes and a domain allowlist.
- **The CLI and the merge driver** treat files as data. There's no eval, no network access, and a capped file size (default 20 MB).
- **Dependencies.** Keep the tree small, using `pnpm audit` in CI and Renovate.
- **Read-only links** are V2, signature-based (§4). Until then there is one link type and it's an edit link, and the UI says so.

### Scalability

- **Hosting cost.**
  - **Shape:** one Durable Object per room, with hibernating WebSockets for idle rooms `[R§5]`.
  - **Expected cost:** hobby scale fits the free tier or close to it.
  - **Abuse protection:** a per-IP rate limit for creating rooms (in the Worker) and a size cap per room.
- **Room scale.** Plan for 2–10 active editors per room, with a hard cap of 50. Above that, presence should degrade first: lower the cursor rate to 10 Hz and stop sending viewport updates.
- **Board scale.**
  - **Designed for:** up to 20k elements per board.
  - **Above that:** the app warns and suggests splitting into multiple boards (V2 multi-page).
- **Lock-in.** The relay talks to its storage through an interface (`RoomStorage`), so the V2 Node and SQLite adapter needs no protocol changes.

---

## 9. Phased implementation plan

Estimates are in **full-time weeks**. Double them for evenings and weekends. Each milestone ends with a usable build and a demo. Every milestone uses TDD for `core` and `format` (property tests where an invariant exists) and Playwright for flows.

| # | Milestone | Weeks | Deliverables | Exit criteria |
|---|---|---|---|---|
| **M0** | Foundations | 1 | The monorepo (pnpm, TS strict, Vite, Vitest, Playwright, ESLint and Prettier, CI on GitHub Actions), `core` schema types, HLC, `fractional-indexing` wrapper, the empty bench page | CI is green. HLC and fractional-index property tests pass. |
| **M1** | Canvas engine | 3 | Camera (pan and zoom), scene and overlay canvases, rbush culling, box, ellipse, diamond and cylinder rendering, the select tool (click, marquee, move, resize, rotate), the store plus ops plus transactions, undo and redo, the bench harness | 10k boxes pan at 60 fps on the reference machine. The undo and redo property test (random op sequences return to their start) passes. |
| **M2** | Tools and editing | 3 | Text, note and code block (DOM edit overlay), arrows with binding and elbow routing, ink (perfect-freehand), the eraser, frames, groups and locks, the style bar and palette tokens, snapping and guides, clipboard, themes, command palette, keymap plus structural navigation, the a11y live region | The F1 and F2 flows pass as Playwright tests. axe reports no serious violations. |
| **M3** | Format and persistence | 2 | Lezer grammar, canonical serialise and parse, round-trip property tests, IndexedDB persistence, the board sidebar, Open folder, external change detection with three-way merge, PNG and SVG export (with embedded source), the `.excalidraw` and Mermaid importers | The round-trip property passes on 10k generated boards. An open-then-close leaves file bytes unchanged (test). The F3 flow passes in Chromium. |
| **M4** | CLI | 1 | `dbm render, fmt, check, merge, diff, init, from-mermaid, from-excalidraw`, published to npm | A scripted git repo test passes: two branches edit the same board and `git merge` with the driver gives the expected canonical output with no markers. |
| **M5** | Collaboration | 3 | The relay DO (protocol, seq, storage, snapshot compaction, limits), the encryption layer, the collab client (op batching, offline queue, reconnect), presence (cursors, selections, follow, soft-lock) | A fuzz test of 3 simulated clients with random ops, delays and disconnects converges to identical state. The two-browser Playwright F4 flow passes. Deployed to Cloudflare. |
| **M6** | Two-way DSL pane | 2 | The CodeMirror pane with highlighting and position folding, text-to-canvas diff and apply with the error rule, canvas-to-text minimal patches with typing protection, auto-placement, Mermaid paste in the pane | Typing a 10-node diagram purely in the pane renders correctly. Dragging on the canvas while the pane is focused never moves the text cursor. |
| **M7** | Polish and launch | 2 | VoiceOver pass, high-contrast theme, empty states and hints, a settings popover, a docs site (format spec, CLI, keymap), a landing page with a demo board, the README `.board` → SVG via the CLI in CI | Launch checklist done. Public v0.1. |

**Total: about 17 full-time weeks.**

**Cut lines if time runs short** (cut in this order):
1. Mermaid import beyond the flowchart basics.
2. The `.excalidraw` importer.
3. Code-block syntax highlighting (fall back to plain monospace).
4. `dbm diff`.

Never cut: the round-trip guarantee, the merge driver, or the core of the two-way pane.

**After launch (the V2 order is driven by usage):**
1. Rich text, tables and KaTeX: the biggest demand.
2. Presentation mode and PDF.
3. The MCP server and the GitHub Action.
4. Read-only links.
5. The Node relay and Docker image.
6. The plugin API.

---

## 10. Risks, trade-offs and decisions needing validation

### Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Building our own engine is the largest scope item. Text editing on a canvas in particular is a known swamp. | High / High | Use DOM overlays for editing (proven by Excalidraw). Plain text only in the MVP. Rich text is deferred to V2 with a contenteditable overlay. |
| The DSL becomes unreadable as attributes pile up | Medium / High | Defaults are omitted, positions can be folded, and styles use short tokens. Validate early (V1 below). |
| The two-way pane fights the user (cursor jumps, transient deletions) | Medium / High | The error rule, typing protection, and minimal patches. A dedicated Playwright suite exercises concurrent typing and dragging. |
| Whole-string last-writer-wins loses concurrent label edits | Medium / Low | The soft-lock presence. Upgrade path: Yjs `Y.Text` for text bodies only. |
| File System Access works only in Chromium | Certain / Medium | Honest UI, download and upload, the CLI. The Tauri desktop app is the long-term fix. |
| tldraw office or Excalidraw ships git-native files first | Medium / Medium | Our wedge is *text-native plus merge driver plus two-way pane together*, and being MIT. Ship M3 and M4 early as a standalone "board format + CLI" release if needed. |
| The free tier or pricing of Durable Objects changes | Low / Medium | The `RoomStorage` interface and the V2 Node relay. |
| rough.js is unmaintained | Low / Low | It's small and MIT, so we can vendor it. |

### Trade-offs taken knowingly

- **Per-property last-writer-wins instead of a CRDT.** We give up character-level text merging. In return we get our own clean file format, a tiny bundle, a trivial relay and fully debuggable state.
- **Canvas2D instead of DOM/SVG rendering.** Speed and ink quality win over the easy accessibility and embeds that DOM rendering gives. The DSL pane makes up the accessibility difference.
- **The file is ordered by z-index, not grouped by type.** Diffs stay minimal and the file order is the paint order. The cost: a "send to back" moves one line, and nodes and edges are interleaved in the text.
- **No accounts.** Zero friction and zero personal data, but no "my boards across devices" apart from folders and git.

### Decisions that need validation before or during M0–M3

| # | Decision | How to validate | By |
|---|---|---|---|
| V1 | DSL syntax and readability (`@x,y WxH`, `->`, `{ }` frame members) | Write 5 real diagrams in it by hand. Show them to 5 developers and ask them to explain what each diagram shows without the canvas. | Before M3 |
| V2 | The extension and name `.board` (generic, may collide) vs `.dbm` | Check GitHub linguist and VS Code collisions. Ask for preferences. | Before M3 |
| V3 | Per-property last-writer-wins is "good enough" in real sessions | Run the M5 fuzz test, then 3 real paired sessions; count lost edits. | M5 |
| V4 | Canvas2D reaches 10k elements at 60 fps with sketchy elements cached | The M1 bench, plus sketchy at M2 | M1–M2 |
| V5 | Auto-placement output is acceptable without dagre | Type the 5 V1 diagrams positionless and judge them | M6 |
| V6 | Clean-by-default still *feels* like a whiteboard | Hallway tests with the hand font plus sketch 1 as the alternative default | M2 |
| V7 | Whether `@tldraw/state` stays the right signals library | Profile during M1. Swap to `@preact/signals-core` if it gets in the way. | M1 |
