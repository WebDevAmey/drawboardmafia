import {
  bounds, elementBounds, elementsInRect, hitTest, isBoundEnd, isConnector, isNode, unionRects,
  type Board, type Connector, type Element, type End, type Id, type InkPoint, type NodeEl, type NodeType,
  type Rect, type Store,
} from '@dbm/core';
import { drawBoard, type Camera, type ThemeName } from '@dbm/render';
import { assetImage, importImage } from '../assets';
import type { Peer } from '../collab/session';
import { LIBRARY, LIBRARY_MIME } from '../library';
import {
  commitText, connectorId, deleteElements, duplicate, insertElements, makeNode, pasteText, restack, selectionText,
} from './actions';

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\'><circle cx=\'10\' cy=\'10\' r=\'7\' fill=\'white\' stroke=\'black\' stroke-width=\'1.5\'/></svg>')}") 10 10, crosshair`;
import { drawOverlay, handleAt, type Handle } from './overlay';

export type Tool = 'select' | 'hand' | 'box' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'ink' | 'text' | 'note' | 'eraser';

export interface EditorState {
  tool: Tool;
  libraryOpen: boolean;
  selection: Id[];
  editingId?: Id;
  zoom: number;
  theme: ThemeName;
  paneOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

type P = { x: number; y: number };

type Gesture =
  | { kind: 'pan'; start: P; cam: Camera }
  | { kind: 'move'; start: P; key: string; orig: Map<Id, Element>; moved: boolean }
  | { kind: 'resize'; id: Id; handle: Handle; start: P; orig: Rect; key: string }
  | { kind: 'marquee'; start: P; now: P; additive: Id[] }
  | { kind: 'create'; type: NodeType; start: P; now: P }
  | { kind: 'arrow'; head: 'end' | 'none'; from: End; start: P; now: P; target?: Id }
  | { kind: 'erase'; hits: Set<Id>; last: P }
  | { kind: 'ink'; pts: P[]; pressures: number[] };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
let gestureSeq = 0;

export class Editor {
  camera: Camera = { x: -80, y: -80, zoom: 1 };
  state: EditorState;
  gesture?: Gesture;
  hover?: Id;
  pointer: P = { x: 0, y: 0 };
  pointerOnCanvas = false;
  /** Remote collaborators (set by the live session). */
  peers = new Map<string, Peer>();
  /** Called when cursor or selection changes (live presence). */
  onPresence?: () => void;
  /** User-facing notices (toasts). */
  onMessage?: (m: string) => void;
  private listeners = new Set<() => void>();
  private size = { width: 0, height: 0 };
  private dpr = 1;
  private scene?: HTMLCanvasElement;
  private overlay?: HTMLCanvasElement;
  private frame = 0;
  private spaceDown = false;

  constructor(public store: Store, theme: ThemeName) {
    this.state = { tool: 'select', libraryOpen: false, selection: [], zoom: 1, theme, paneOpen: false, canUndo: false, canRedo: false };
    store.subscribe(() => {
      const board = store.get();
      const live = this.state.selection.filter((id) => board.elements.some((e) => e.id === id));
      this.set({ selection: live, canUndo: store.canUndo(), canRedo: store.canRedo() });
      this.requestDraw();
    });
  }

  // ---------- state ----------

  get board(): Board {
    return this.store.get();
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getState = () => this.state;

  set(patch: Partial<EditorState>) {
    const next = { ...this.state, ...patch };
    if (Object.keys(patch).every((k) => Object.is((this.state as never)[k], (next as never)[k]))) return;
    this.state = next;
    this.listeners.forEach((l) => l());
    this.requestDraw();
  }

  setTool(tool: Tool) {
    this.gesture = undefined;
    this.set({ tool, ...(tool !== 'select' ? { selection: [] } : {}) });
  }

  select(ids: Id[]) {
    this.set({ selection: ids });
    this.onPresence?.();
  }

  // ---------- coordinates ----------

  toWorld(p: P): P {
    return { x: p.x / this.camera.zoom + this.camera.x, y: p.y / this.camera.zoom + this.camera.y };
  }

  toScreen(p: P): P {
    return { x: (p.x - this.camera.x) * this.camera.zoom, y: (p.y - this.camera.y) * this.camera.zoom };
  }

  setCamera(cam: Camera) {
    this.camera = { ...cam, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom)) };
    this.set({ zoom: this.camera.zoom });
    this.requestDraw();
  }

  zoomAt(screen: P, factor: number) {
    const before = this.toWorld(screen);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.camera.zoom * factor));
    this.setCamera({ zoom, x: before.x - screen.x / zoom, y: before.y - screen.y / zoom });
  }

  zoomBy(factor: number) {
    this.zoomAt({ x: this.size.width / 2, y: this.size.height / 2 }, factor);
  }

  zoomToFit(ids?: Id[]) {
    const byId = new Map(this.board.elements.map((e) => [e.id, e]));
    const els = ids?.length ? ids.map((id) => byId.get(id)!).filter(Boolean) : this.board.elements;
    const r = unionRects(els.map((e) => elementBounds(e, byId)).filter((b): b is Rect => !!b));
    if (!r || !this.size.width) return this.setCamera({ x: -this.size.width / 2, y: -this.size.height / 2, zoom: 1 });
    const pad = 80;
    const zoom = Math.min(1.5, (this.size.width - pad * 2) / Math.max(r.w, 1), (this.size.height - pad * 2) / Math.max(r.h, 1));
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.setCamera({ zoom: z, x: r.x + r.w / 2 - this.size.width / 2 / z, y: r.y + r.h / 2 - this.size.height / 2 / z });
  }

  viewportCenter(): P {
    return this.toWorld({ x: this.size.width / 2, y: this.size.height / 2 });
  }

  // ---------- rendering ----------

  attach(container: HTMLElement, scene: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.scene = scene;
    this.overlay = overlay;
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      this.size = { width: r.width, height: r.height };
      for (const c of [scene, overlay]) {
        c.width = Math.round(r.width * this.dpr);
        c.height = Math.round(r.height * this.dpr);
        c.style.width = `${r.width}px`;
        c.style.height = `${r.height}px`;
      }
      this.requestDraw();
    });
    ro.observe(container);
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      container.addEventListener(t, f as EventListener, o);
      return () => container.removeEventListener(t, f as EventListener, o);
    };
    const offs = [
      on('pointerdown', (e) => this.onPointerDown(e, container)),
      on('pointermove', (e) => this.onPointerMove(e, container)),
      on('pointerup', (e) => this.onPointerUp(e, container)),
      on('pointercancel', () => this.cancelGesture()),
      on('dblclick', (e) => this.onDoubleClick(e, container)),
      on('wheel', (e) => this.onWheel(e, container), { passive: false }),
      on('pointerleave', () => {
        this.pointerOnCanvas = false;
        this.onPresence?.();
      }),
      on('dragover', (e) => {
        if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes(LIBRARY_MIME)) {
          e.preventDefault();
          e.dataTransfer!.dropEffect = 'copy';
        }
      }),
      on('drop', (e) => this.onDrop(e, container)),
    ];
    const keyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.spaceDown = false;
    };
    const copy = (e: ClipboardEvent) => this.onCopy(e, false);
    const cut = (e: ClipboardEvent) => this.onCopy(e, true);
    const paste = (e: ClipboardEvent) => this.onPaste(e);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('copy', copy);
    window.addEventListener('cut', cut);
    window.addEventListener('paste', paste);
    return () => {
      ro.disconnect();
      offs.forEach((f) => f());
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('copy', copy);
      window.removeEventListener('cut', cut);
      window.removeEventListener('paste', paste);
    };
  }

  requestDraw() {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    if (!this.scene || !this.overlay) return;
    const g = this.gesture;
    const opts = {
      theme: this.state.theme, camera: this.camera, width: this.size.width, height: this.size.height, dpr: this.dpr,
      editingId: this.state.editingId, grid: this.board.grid ?? 'none', images: assetImage,
      dim: g?.kind === 'erase' ? g.hits : undefined,
    } as const;
    drawBoard(this.scene.getContext('2d')!, this.board, opts);
    drawOverlay(this.overlay.getContext('2d')!, this, opts);
    // ease remote cursors toward their targets
    let moving = false;
    for (const p of this.peers.values()) {
      if (!p.cursor) continue;
      const s = p.shown ?? p.cursor;
      const dx = p.cursor.x - s.x;
      const dy = p.cursor.y - s.y;
      if (Math.hypot(dx, dy) < 0.3) p.shown = p.cursor;
      else {
        p.shown = { x: s.x + dx * 0.35, y: s.y + dy * 0.35 };
        moving = true;
      }
    }
    if (moving) this.requestDraw();
  }

  // ---------- pointer input ----------

  private local(e: PointerEvent | MouseEvent | WheelEvent, el: HTMLElement): P {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onWheel(e: WheelEvent, el: HTMLElement) {
    e.preventDefault();
    const p = this.local(e, el);
    if (e.ctrlKey || e.metaKey) this.zoomAt(p, Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002)));
    else this.setCamera({ ...this.camera, x: this.camera.x + e.deltaX / this.camera.zoom, y: this.camera.y + e.deltaY / this.camera.zoom });
  }

  private onPointerDown(e: PointerEvent, el: HTMLElement) {
    if (this.state.editingId) return; // the text overlay handles its own clicks; blur commits
    el.setPointerCapture(e.pointerId);
    const s = this.local(e, el);
    const w = this.toWorld(s);
    this.pointer = w;
    const { tool } = this.state;
    if (e.button === 1 || this.spaceDown || tool === 'hand') {
      this.gesture = { kind: 'pan', start: s, cam: { ...this.camera } };
      return;
    }
    if (e.button !== 0) return;
    switch (tool) {
      case 'select': {
        const handle = this.selectedNode() && handleAt(this, s);
        if (handle) {
          const n = this.selectedNode()!;
          this.gesture = { kind: 'resize', id: n.id, handle, start: w, orig: bounds(n)!, key: `g${++gestureSeq}` };
          return;
        }
        const hit = hitTest(this.board, w, 4 / this.camera.zoom);
        if (hit) {
          let sel = this.state.selection;
          if (e.shiftKey) sel = sel.includes(hit) ? sel.filter((i) => i !== hit) : [...sel, hit];
          else if (!sel.includes(hit)) sel = [hit];
          this.select(this.expandGroups(sel));
          if (sel.includes(hit)) this.startMove(w);
        } else {
          if (!e.shiftKey) this.select([]);
          this.gesture = { kind: 'marquee', start: w, now: w, additive: e.shiftKey ? this.state.selection : [] };
        }
        return;
      }
      case 'box': case 'ellipse': case 'diamond': case 'note':
        this.gesture = { kind: 'create', type: tool, start: w, now: w };
        return;
      case 'text': {
        const t = makeNode(this.board, 'text', { x: w.x, y: w.y - 12, w: 20, h: 23 });
        this.store.transact((d) => d.put(t));
        this.set({ selection: [t.id], tool: 'select' });
        this.startEditing(t.id);
        return;
      }
      case 'arrow': case 'line': {
        const target = this.nodeAt(w);
        this.gesture = { kind: 'arrow', head: tool === 'arrow' ? 'end' : 'none', from: target ? { id: target } : { x: Math.round(w.x), y: Math.round(w.y) }, start: w, now: w, target };
        return;
      }
      case 'eraser':
        this.gesture = { kind: 'erase', hits: new Set(), last: w };
        this.eraseAt(w);
        return;
      case 'ink':
        this.gesture = { kind: 'ink', pts: [w], pressures: [e.pointerType === 'pen' ? e.pressure : 0.5] };
        return;
    }
  }

  private onPointerMove(e: PointerEvent, el: HTMLElement) {
    const s = this.local(e, el);
    const w = this.toWorld(s);
    this.pointer = w;
    this.pointerOnCanvas = true;
    this.onPresence?.();
    const g = this.gesture;
    if (this.state.tool === 'eraser') this.requestDraw();
    if (!g) {
      const hover = this.state.tool === 'select' || this.state.tool === 'arrow' ? hitTest(this.board, w, 4 / this.camera.zoom) : undefined;
      if (hover !== this.hover) {
        this.hover = hover;
        this.requestDraw();
      }
      el.style.cursor = this.cursorFor(s, hover);
      return;
    }
    switch (g.kind) {
      case 'pan':
        this.setCamera({ ...g.cam, x: g.cam.x - (s.x - g.start.x) / this.camera.zoom, y: g.cam.y - (s.y - g.start.y) / this.camera.zoom });
        return;
      case 'move': {
        const dx = Math.round(w.x - g.start.x);
        const dy = Math.round(w.y - g.start.y);
        if (!g.moved && Math.hypot(dx, dy) * this.camera.zoom < 3) return;
        g.moved = true;
        this.applyMove(g, dx, dy);
        return;
      }
      case 'resize':
        const isImage = this.board.elements.find((x) => x.id === g.id)?.type === 'image';
        this.applyResize(g, w, isImage ? !e.shiftKey : e.shiftKey);
        return;
      case 'marquee': case 'create':
        g.now = w;
        this.requestDraw();
        return;
      case 'arrow': {
        g.now = w;
        const t = this.nodeAt(w);
        g.target = t && !(isBoundEnd(g.from) && g.from.id === t) ? t : undefined;
        this.requestDraw();
        return;
      }
      case 'erase': {
        // sample along the segment so fast strokes don't skip elements
        const steps = Math.max(1, Math.ceil((Math.hypot(w.x - g.last.x, w.y - g.last.y) * this.camera.zoom) / 6));
        for (let i = 1; i <= steps; i++) this.eraseAt({ x: g.last.x + ((w.x - g.last.x) * i) / steps, y: g.last.y + ((w.y - g.last.y) * i) / steps });
        g.last = w;
        return;
      }
      case 'ink': {
        const coalesced = e.getCoalescedEvents?.();
        const events = coalesced?.length ? coalesced : [e];
        for (const ev of events) {
          const p = this.toWorld(this.local(ev, el));
          const last = g.pts[g.pts.length - 1]!;
          if (Math.hypot(p.x - last.x, p.y - last.y) * this.camera.zoom < 1) continue;
          g.pts.push(p);
          g.pressures.push(ev.pointerType === 'pen' ? ev.pressure : 0.5);
        }
        this.requestDraw();
        return;
      }
    }
  }

  private onPointerUp(e: PointerEvent, el: HTMLElement) {
    const g = this.gesture;
    this.gesture = undefined;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!g) return;
    switch (g.kind) {
      case 'marquee': {
        const r = rectFrom(g.start, g.now);
        const inside = elementsInRect(this.board, r);
        this.select(this.expandGroups([...new Set([...g.additive, ...inside])]));
        break;
      }
      case 'create': {
        let r = rectFrom(g.start, g.now);
        const tiny = r.w * this.camera.zoom < 6 && r.h * this.camera.zoom < 6;
        const n = makeNode(this.board, g.type, tiny ? { x: 0, y: 0 } : r);
        if (tiny) r = { x: g.start.x - n.w / 2, y: g.start.y - n.h / 2, w: n.w, h: n.h };
        const node = { ...n, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } as NodeEl;
        this.store.transact((d) => d.put(node));
        this.set({ selection: [node.id], tool: 'select' });
        if (node.type === 'note') this.startEditing(node.id);
        break;
      }
      case 'arrow': {
        const len = Math.hypot(g.now.x - g.start.x, g.now.y - g.start.y) * this.camera.zoom;
        if (len < 8 && !g.target) break;
        const to: End = g.target ? { id: g.target } : { x: Math.round(g.now.x), y: Math.round(g.now.y) };
        const c: Connector = {
          id: connectorId(this.board, g.from, to), type: 'arrow', from: g.from, to, head: g.head, route: 'straight',
          stroke: 'ink', fill: 'none', width: 2, dash: 'solid',
        };
        this.store.transact((d) => d.put(c));
        this.set({ selection: [c.id], tool: 'select' });
        break;
      }
      case 'erase':
        if (g.hits.size) deleteElements(this.store, [...g.hits]);
        break;
      case 'ink': {
        if (g.pts.length < 2) g.pts.push({ x: g.pts[0]!.x + 0.5, y: g.pts[0]!.y + 0.5 }), g.pressures.push(g.pressures[0]!);
        const ox = Math.round(g.pts[0]!.x);
        const oy = Math.round(g.pts[0]!.y);
        const pts: InkPoint[] = g.pts.map((p, i) => [Math.round(p.x - ox), Math.round(p.y - oy), g.pressures[i]!]);
        const ink = { ...makeNode(this.board, 'ink', { x: ox, y: oy }), w: 0, h: 0, pts } as NodeEl;
        this.store.transact((d) => d.put(ink));
        break;
      }
    }
    this.requestDraw();
  }

  private onDoubleClick(e: MouseEvent, el: HTMLElement) {
    if (this.state.tool !== 'select' || this.state.editingId) return;
    const w = this.toWorld(this.local(e, el));
    const hit = hitTest(this.board, w, 4 / this.camera.zoom);
    if (hit) {
      const target = this.board.elements.find((x) => x.id === hit)!;
      if (target.type !== 'ink' && target.type !== 'image') {
        this.select([hit]);
        this.startEditing(hit);
      }
      return;
    }
    const t = makeNode(this.board, 'text', { x: w.x, y: w.y - 12, w: 20, h: 23 });
    this.store.transact((d) => d.put(t));
    this.select([t.id]);
    this.startEditing(t.id);
  }

  private cancelGesture() {
    this.gesture = undefined;
    this.requestDraw();
  }

  private cursorFor(s: P, hover?: Id): string {
    const { tool } = this.state;
    if (this.spaceDown || tool === 'hand') return 'grab';
    if (tool === 'select') {
      const h = this.selectedNode() && handleAt(this, s);
      if (h) return h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize';
      return hover ? 'move' : 'default';
    }
    if (tool === 'eraser') return ERASER_CURSOR;
    return tool === 'text' ? 'text' : 'crosshair';
  }

  // ---------- gestures ----------

  selectedNode(): NodeEl | undefined {
    if (this.state.selection.length !== 1) return undefined;
    const el = this.board.elements.find((e) => e.id === this.state.selection[0]);
    return el && isNode(el) && el.type !== 'ink' && el.x !== undefined ? el : undefined;
  }

  private nodeAt(w: P): Id | undefined {
    for (let i = this.board.elements.length - 1; i >= 0; i--) {
      const el = this.board.elements[i]!;
      if (!isNode(el) || el.type === 'ink' || el.type === 'frame') continue;
      const r = bounds(el);
      if (r && w.x >= r.x - 6 && w.x <= r.x + r.w + 6 && w.y >= r.y - 6 && w.y <= r.y + r.h + 6) return el.id;
    }
    return undefined;
  }

  private expandGroups(ids: Id[]): Id[] {
    const groups = new Set(this.board.elements.filter((e) => ids.includes(e.id) && e.group).map((e) => e.group!));
    if (!groups.size) return ids;
    return [...new Set([...ids, ...this.board.elements.filter((e) => e.group && groups.has(e.group)).map((e) => e.id)])];
  }

  private startMove(w: P) {
    const sel = new Set(this.state.selection);
    // frames carry their members along
    for (const el of this.board.elements) if (el.type === 'frame' && sel.has(el.id)) el.members.forEach((m) => sel.add(m));
    const orig = new Map(this.board.elements.filter((e) => sel.has(e.id) && !e.locked).map((e) => [e.id, e]));
    this.gesture = { kind: 'move', start: w, key: `g${++gestureSeq}`, orig, moved: false };
  }

  private applyMove(g: Extract<Gesture, { kind: 'move' }>, dx: number, dy: number) {
    const shift = (end: End): End => (isBoundEnd(end) ? end : { x: end.x + dx, y: end.y + dy });
    this.store.transact((d) => {
      for (const el of g.orig.values()) {
        if (isConnector(el)) {
          d.update(el.id, { from: shift(el.from), to: shift(el.to), ...(el.via ? { via: el.via.map(([x, y]) => [x + dx, y + dy]) } : {}) });
        } else if (el.x !== undefined && el.y !== undefined) d.update(el.id, { x: el.x + dx, y: el.y + dy });
      }
    }, { mergeKey: g.key });
  }

  private applyResize(g: Extract<Gesture, { kind: 'resize' }>, w: P, keepAspect: boolean) {
    const o = g.orig;
    const dx = w.x - g.start.x;
    const dy = w.y - g.start.y;
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    if (g.handle.includes('w')) x1 += dx;
    if (g.handle.includes('e')) x2 += dx;
    if (g.handle.includes('n')) y1 += dy;
    if (g.handle.includes('s')) y2 += dy;
    let r = rectFrom({ x: x1, y: y1 }, { x: x2, y: y2 });
    if (keepAspect && o.w > 0 && o.h > 0) {
      const scale = Math.max(r.w / o.w, r.h / o.h);
      r = { ...r, w: o.w * scale, h: o.h * scale };
      if (x2 < x1 || g.handle.includes('w')) r.x = o.x + o.w - r.w;
      if (y2 < y1 || g.handle.includes('n')) r.y = o.y + o.h - r.h;
    }
    const patch = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(8, Math.round(r.w)), h: Math.max(8, Math.round(r.h)) };
    this.store.transact((d) => d.update(g.id, patch), { mergeKey: g.key });
  }

  // ---------- text editing ----------

  startEditing(id: Id) {
    this.set({ editingId: id, tool: 'select' });
  }

  finishEditing(value: string | undefined) {
    const id = this.state.editingId;
    if (!id) return;
    this.set({ editingId: undefined });
    if (value === undefined) return;
    const finalId = commitText(this.store, id, value);
    this.select(finalId ? [finalId] : []);
  }

  // ---------- commands ----------

  deleteSelection() {
    deleteElements(this.store, this.state.selection);
    this.select([]);
  }

  duplicateSelection() {
    if (this.state.selection.length) this.select(duplicate(this.store, this.state.selection));
  }

  nudge(dx: number, dy: number) {
    const sel = new Set(this.state.selection);
    if (!sel.size) return;
    this.store.transact((d) => {
      for (const el of this.board.elements) {
        if (!sel.has(el.id) || el.locked) continue;
        if (isNode(el) && el.x !== undefined && el.y !== undefined) d.update(el.id, { x: el.x + dx, y: el.y + dy });
      }
    }, { mergeKey: 'nudge' });
  }

  restack(how: Parameters<typeof restack>[2]) {
    restack(this.store, this.state.selection, how);
  }

  style(patch: Partial<Element>) {
    const sel = this.state.selection;
    if (!sel.length) return;
    this.store.transact((d) => {
      for (const id of sel) {
        const el = d.get(id);
        if (!el) continue;
        const p = { ...patch } as Record<string, unknown>;
        if (isConnector(el)) delete p.fill;
        if (el.type === 'ink') delete p.fill;
        d.update(id, p);
      }
    });
  }

  undo() {
    this.store.undo();
  }

  redo() {
    this.store.redo();
  }

  private onCopy(e: ClipboardEvent, cut: boolean) {
    if (isTyping(e.target) || !this.state.selection.length) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', selectionText(this.board, this.state.selection));
    if (cut) this.deleteSelection();
  }

  private onPaste(e: ClipboardEvent) {
    if (isTyping(e.target)) return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void this.insertImage(file, this.pointerInView() ? this.pointer : this.viewportCenter());
      return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const ids = pasteText(this.store, text, this.pointerInView() ? this.pointer : this.viewportCenter());
    this.set({ selection: ids, tool: 'select' });
  }

  private pointerInView(): boolean {
    const s = this.toScreen(this.pointer);
    return s.x >= 0 && s.y >= 0 && s.x <= this.size.width && s.y <= this.size.height;
  }

  // ---------- eraser, images, library ----------

  private eraseAt(w: P) {
    const g = this.gesture;
    if (g?.kind !== 'erase') return;
    const hit = hitTest(this.board, w, 6 / this.camera.zoom);
    if (hit && !g.hits.has(hit) && !this.board.elements.find((x) => x.id === hit)?.locked) {
      g.hits.add(hit);
      this.requestDraw();
    }
  }

  /** Opens the file picker (set by the UI). */
  onPickImage?: () => void;

  async insertImage(file: Blob, at: P = this.viewportCenter()) {
    try {
      const { name, width, height } = await importImage(file);
      const scale = Math.min(1, 480 / Math.max(width, height));
      const w = Math.max(8, Math.round(width * scale));
      const h = Math.max(8, Math.round(height * scale));
      const node = { ...makeNode(this.board, 'image', { x: at.x - w / 2, y: at.y - h / 2, w, h }), asset: name } as NodeEl;
      this.store.transact((d) => d.put(node));
      this.set({ selection: [node.id], tool: 'select' });
    } catch (err) {
      this.onMessage?.((err as Error).message || 'Could not add that image');
    }
  }

  insertLibraryItem(id: string, at: P = this.viewportCenter()) {
    const item = LIBRARY.find((i) => i.id === id);
    if (!item) return;
    const ids = insertElements(this.store, item.make(), { x: 0, y: 0 });
    // centre the inserted group on the drop point
    const byId = new Map(this.board.elements.map((e) => [e.id, e]));
    const r = unionRects(ids.map((i) => elementBounds(byId.get(i)!, byId)).filter((b): b is Rect => !!b));
    if (r) {
      const dx = Math.round(at.x - (r.x + r.w / 2));
      const dy = Math.round(at.y - (r.y + r.h / 2));
      this.store.transact((d) => {
        for (const i of ids) {
          const el = d.get(i)!;
          if (isNode(el) && el.x !== undefined && el.y !== undefined) d.update(i, { x: el.x + dx, y: el.y + dy });
        }
      }, { mergeKey: `lib-${++gestureSeq}` });
    }
    this.set({ selection: ids, tool: 'select' });
  }

  private onDrop(e: DragEvent, el: HTMLElement) {
    e.preventDefault();
    const at = this.toWorld(this.local(e, el));
    const lib = e.dataTransfer?.getData(LIBRARY_MIME);
    if (lib) return this.insertLibraryItem(lib, at);
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file) void this.insertImage(file, at);
    else if (e.dataTransfer?.files.length) this.onMessage?.('Only images can be dropped on the board');
  }

  // ---------- keyboard ----------

  private onKeyDown(e: KeyboardEvent) {
    if (isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const handled = () => e.preventDefault();
    if (e.code === 'Space' && !mod) {
      this.spaceDown = true;
      return handled();
    }
    if (mod) {
      if (k === 'z' && !e.shiftKey) return handled(), this.undo();
      if ((k === 'z' && e.shiftKey) || k === 'y') return handled(), this.redo();
      if (k === 'a') return handled(), this.select(this.board.elements.map((x) => x.id));
      if (k === 'd') return handled(), this.duplicateSelection();
      if (k === '/') return handled(), this.set({ paneOpen: !this.state.paneOpen });
      if (k === '=' || k === '+') return handled(), this.zoomBy(1.25);
      if (k === '-') return handled(), this.zoomBy(0.8);
      if (k === '0') return handled(), this.setCamera({ ...this.camera, zoom: 1 });
      if (e.code === 'BracketRight') return handled(), this.restack(e.shiftKey ? 'front' : 'forward');
      if (e.code === 'BracketLeft') return handled(), this.restack(e.shiftKey ? 'back' : 'backward');
      return;
    }
    if (e.shiftKey && e.code === 'Digit1') return handled(), this.zoomToFit();
    if (e.shiftKey && e.code === 'Digit2') return handled(), this.zoomToFit(this.state.selection);
    if (e.altKey) return;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'Escape':
        this.gesture = undefined;
        if (this.state.libraryOpen) this.set({ libraryOpen: false });
        else if (this.state.tool !== 'select') this.setTool('select');
        else this.select([]);
        return handled();
      case 'Delete': case 'Backspace':
        return handled(), this.deleteSelection();
      case 'Enter':
        if (this.state.selection.length === 1) {
          const el = this.board.elements.find((x) => x.id === this.state.selection[0]);
          if (el && el.type !== 'ink' && el.type !== 'image') return handled(), this.startEditing(el.id);
        }
        return;
      case 'ArrowLeft': return handled(), this.nudge(-step, 0);
      case 'ArrowRight': return handled(), this.nudge(step, 0);
      case 'ArrowUp': return handled(), this.nudge(0, -step);
      case 'ArrowDown': return handled(), this.nudge(0, step);
    }
    if (e.code === 'KeyI' && !e.shiftKey) return handled(), this.onPickImage?.();
    if (e.code === 'KeyB' && !e.shiftKey) return handled(), this.set({ libraryOpen: !this.state.libraryOpen });
    const tools: Record<string, Tool> = { KeyV: 'select', KeyH: 'hand', KeyR: 'box', KeyO: 'ellipse', KeyD: 'diamond', KeyA: 'arrow', KeyL: 'line', KeyP: 'ink', KeyT: 'text', KeyN: 'note', KeyE: 'eraser' };
    const tool = tools[e.code];
    if (tool && !e.shiftKey) {
      handled();
      this.setTool(tool);
    }
  }
}

export const rectFrom = (a: P, b: P): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

