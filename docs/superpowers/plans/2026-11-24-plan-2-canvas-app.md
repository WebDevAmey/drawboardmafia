# Plan 2: canvas app, first runnable slice

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A runnable whiteboard at `pnpm dev`. It renders boards on a Canvas2D canvas, supports pan and zoom, selecting, moving, resizing and deleting, drawing shapes, arrows, ink and text, undo and redo, autosave, export, and a **live two-way text pane** (first version).

**Architecture:**
- `core/store.ts`: a framework-free store of transactions, applied as element-level patches, with undo and redo stacks and subscriptions.
- `core/hit.ts`: hit-testing.
- `render/canvas.ts`: draws boards with Canvas2D, sharing geometry with the SVG renderer.
- `app`: React 19 for the chrome only. The canvas is driven directly by an `Editor` class holding the camera, the active tool and the input state.

**Deliberately deferred:**
- **Collaboration and HLC clocks** (plan 5). The store uses element-level patches now, and per-property ops replace them when sync arrives.
- **The `rbush` spatial index.** A linear scan is fine below about 2k elements. It gets added with the bench harness.
- **CodeMirror** (plan 6). A plain textarea stands in for now.

## Global constraints

- The canvas never re-renders through React. React renders the toolbar, the text pane and the status bar.
- Every edit goes through `store.transact()`, so undo always works.
- **The text pane only applies text that parses without errors.** It never deletes elements because of a syntax error. This is the spec §3.1 error rule.
- Light and dark themes follow the system, using palette tokens from `core`.

## Tasks

1. **Store** (`core/src/store.ts`, TDD).
   - `createStore(board)` returns `{ get(), transact(fn), undo(), redo(), canUndo, canRedo, subscribe(cb), replace(board) }`.
   - `transact(fn)` receives a draft API: `put(el, index?)`, `update(id, patch)`, `remove(id)` and `reorder(ids)`. It records the inverse patches.
   - `replace(board)` is an undoable diff applied against the current board, used by the text pane.
2. **Hit-testing** (`core/src/hit.ts`, TDD).
   - `hitTest(board, point, tolerance)` returns the topmost element id. Nodes are hit inside their bounds; frames only on their border and label; connectors near their polyline.
   - `elementsInRect(board, rect)` finds elements fully inside a marquee.
3. **Canvas renderer** (`render/src/canvas.ts`).
   - `drawBoard(ctx, board, {theme, camera, dpr, selection})` covers every element type. It reuses `connectorPoints`, `measure` and perfect-freehand, and draws grid dots.
4. **App shell** (`packages/app`).
   - Vite + React. An `Editor` class holds the camera and the tools: select, box, ellipse, diamond, arrow, ink, text, note.
   - Pointer pipeline with coalesced events, wheel and pinch zoom, space-drag pan.
   - Selection with handles: move, resize, marquee, shift-click.
   - Text editing through a textarea overlay (double-click or Enter).
   - Keyboard map (spec §4) and IndexedDB autosave.
   - Export SVG and PNG, theme following the system.
5. **Text pane.** `Cmd+/` toggles it. It shows `serialize(board)` and updates on store changes unless it has focus. Typing applies through `store.replace` when the parse has no errors; otherwise it lists the errors.
6. **Verify.** Run it in the browser preview: draw, move, undo, edit text in the pane, export. Commit.
