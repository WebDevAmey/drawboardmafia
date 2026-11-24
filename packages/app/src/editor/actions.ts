import {
  STYLE_DEFAULTS, connectorPoints, defaultFill, defaultSize, elementBounds, isBoundEnd, isConnector, isNode,
  placeUnpositioned, unionRects, type Board, type Connector, type Element, type End, type Id, type NodeEl,
  type NodeType, type Rect, type Store,
} from '@dbm/core';
import { fromMermaid, parse, serialize } from '@dbm/format';
import { measure, FONT_PX } from '@dbm/render';
import { newId, slugId } from './ids';

export function makeNode(board: Board, type: NodeType, rect: Partial<Rect> & { x: number; y: number }): NodeEl {
  const size = defaultSize(type);
  const base = {
    id: newId(board), type, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w ?? size.w),
    h: Math.round(rect.h ?? size.h), rot: 0, ...STYLE_DEFAULTS, fill: defaultFill(type),
  };
  if (type === 'text' || type === 'note' || type === 'code') return { ...base, type, text: '' } as NodeEl;
  if (type === 'frame') return { ...base, type, name: 'Frame', members: [] } as NodeEl;
  return base as NodeEl;
}

/** Id for a new connector: `from-to` when both ends are bound and that id is free, else anonymous. */
export function connectorId(board: Board, from: End, to: End): Id {
  if (isBoundEnd(from) && isBoundEnd(to)) {
    const id = `${from.id}-${to.id}`;
    if (/^[a-z][a-z0-9_-]*$/.test(id) && !board.elements.some((e) => e.id === id)) return id;
  }
  return newId(board);
}

/** Current world position of a connector's endpoints (used when detaching). */
function endPositions(c: Connector, byId: Map<Id, Element>) {
  const geo = connectorPoints(c, byId);
  return geo ? { from: geo.pts[0]!, to: geo.pts[geo.pts.length - 1]! } : null;
}

export function deleteElements(store: Store, ids: Id[]) {
  if (!ids.length) return;
  const board = store.get();
  const del = new Set(ids);
  const byId = new Map(board.elements.map((e) => [e.id, e]));
  store.transact((d) => {
    for (const el of board.elements) {
      if (del.has(el.id)) continue;
      if (isConnector(el)) {
        const dropFrom = isBoundEnd(el.from) && del.has(el.from.id);
        const dropTo = isBoundEnd(el.to) && del.has(el.to.id);
        if (dropFrom || dropTo) {
          const pos = endPositions(el, byId);
          if (!pos) continue;
          d.update(el.id, {
            ...(dropFrom ? { from: { x: Math.round(pos.from.x), y: Math.round(pos.from.y) } } : {}),
            ...(dropTo ? { to: { x: Math.round(pos.to.x), y: Math.round(pos.to.y) } } : {}),
          });
        }
      } else if (el.type === 'frame' && el.members.some((m) => del.has(m))) {
        d.update(el.id, { members: el.members.filter((m) => !del.has(m)) });
      }
    }
    for (const id of ids) d.remove(id);
  });
}

/** Copies elements with fresh ids; internal references are remapped. Returns the new ids. */
export function insertElements(store: Store, els: Element[], offset: { x: number; y: number }): Id[] {
  const board = store.get();
  const reserved = new Set<string>();
  const map = new Map<Id, Id>();
  for (const el of els) {
    const keep = !el.id.startsWith('~') && !board.elements.some((e) => e.id === el.id) && !reserved.has(el.id);
    const id = keep ? el.id : el.id.startsWith('~') ? newId(board, reserved) : (slugId(el.id, board, reserved) ?? newId(board, reserved));
    reserved.add(id);
    map.set(el.id, id);
  }
  const remapEnd = (e: End): End => (isBoundEnd(e) ? (map.has(e.id) ? { id: map.get(e.id)! } : e) : { x: e.x + offset.x, y: e.y + offset.y });
  const out = els.map((el): Element => {
    const id = map.get(el.id)!;
    if (isConnector(el)) {
      return { ...el, id, from: remapEnd(el.from), to: remapEnd(el.to), ...(el.via ? { via: el.via.map(([x, y]) => [x + offset.x, y + offset.y] as [number, number]) } : {}) };
    }
    const n = { ...el, id } as NodeEl;
    if (n.x !== undefined) n.x += offset.x;
    if (n.y !== undefined) n.y += offset.y;
    if (n.type === 'frame') n.members = n.members.map((m) => map.get(m) ?? m);
    return n;
  });
  store.transact((d) => out.forEach((el) => d.put(el)));
  return out.map((e) => e.id);
}

export function duplicate(store: Store, ids: Id[]): Id[] {
  const set = new Set(ids);
  const els = store.get().elements.filter((e) => set.has(e.id));
  return insertElements(store, els, { x: 24, y: 24 });
}

/** .board text for a subset of the board (used by copy). */
export function selectionText(board: Board, ids: Id[]): string {
  const set = new Set(ids);
  return serialize({ ...board, elements: board.elements.filter((e) => set.has(e.id)), trailingComments: [] });
}

/** Pastes .board text, a Mermaid flowchart, or plain text centered at `at`. Returns new ids. */
export function pasteText(store: Store, text: string, at: { x: number; y: number }): Id[] {
  const trimmed = text.trim();
  let els: Element[] | undefined;
  if (/^board\s+1\b/.test(trimmed)) {
    const r = parse(trimmed);
    if (!r.diagnostics.some((d) => d.severity === 'error')) els = placeUnpositioned(r.board).elements;
  } else if (/^(flowchart|graph)\b/.test(trimmed)) {
    const r = fromMermaid(trimmed);
    if (!r.diagnostics.some((d) => d.severity === 'error')) els = r.board.elements;
  }
  if (els?.length) {
    const byId = new Map(els.map((e) => [e.id, e]));
    const r = unionRects(els.map((e) => elementBounds(e, byId)).filter((b): b is Rect => !!b));
    const offset = r ? { x: Math.round(at.x - (r.x + r.w / 2)), y: Math.round(at.y - (r.y + r.h / 2)) } : { x: 0, y: 0 };
    return insertElements(store, els, offset);
  }
  if (!trimmed) return [];
  const m = measure(trimmed, FONT_PX[2]);
  const el = makeNode(store.get(), 'text', { x: at.x - m.width / 2, y: at.y - m.height / 2, w: m.width, h: m.height });
  store.transact((d) => d.put({ ...el, text: trimmed } as Element));
  return [el.id];
}

/**
 * Commits edited text. Text elements are resized to fit. The first time an anonymous shape,
 * note or text gets a label, it is renamed to a readable slug id (references are rewritten).
 * Empty text elements are deleted. Returns the element's final id.
 */
export function commitText(store: Store, id: Id, value: string): Id | undefined {
  const board = store.get();
  const el = board.elements.find((e) => e.id === id);
  if (!el) return undefined;
  if (el.type === 'text' && value.trim() === '') {
    deleteElements(store, [id]);
    return undefined;
  }
  const patch: Record<string, unknown> = {};
  if (isConnector(el)) patch.label = value === '' ? undefined : value;
  else if (el.type === 'text' || el.type === 'note' || el.type === 'code') patch.text = value;
  else if (el.type === 'frame') patch.name = value;
  else if (el.type === 'box' || el.type === 'ellipse' || el.type === 'diamond' || el.type === 'cylinder') patch.label = value === '' ? undefined : value;
  if (el.type === 'text') {
    const m = measure(value, FONT_PX[el.size ?? 2], el.font ?? 'sans');
    patch.w = Math.max(20, Math.ceil(m.width));
    patch.h = Math.ceil(m.height);
  }
  const rename = isNode(el) && el.id.startsWith('~') && el.type !== 'ink' && el.type !== 'image' && value.trim() !== ''
    ? slugId(value.split('\n')[0]!, board) : undefined;
  store.transact((d) => {
    d.update(id, patch);
    if (!rename) return;
    const index = board.elements.findIndex((e) => e.id === id);
    const updated = d.get(id)!;
    d.remove(id);
    d.put({ ...updated, id: rename }, index);
    for (const other of board.elements) {
      if (isConnector(other)) {
        const from = isBoundEnd(other.from) && other.from.id === id ? { id: rename } : undefined;
        const to = isBoundEnd(other.to) && other.to.id === id ? { id: rename } : undefined;
        if (!from && !to) continue;
        const next = { ...(d.get(other.id) as Connector), ...(from ? { from } : {}), ...(to ? { to } : {}) };
        const oldDefault = isBoundEnd(other.from) && isBoundEnd(other.to) && other.id === `${other.from.id}-${other.to.id}`;
        const idx = board.elements.findIndex((e) => e.id === other.id);
        if (oldDefault && isBoundEnd(next.from) && isBoundEnd(next.to)) {
          const nid = `${next.from.id}-${next.to.id}`;
          if (!d.get(nid)) {
            d.remove(other.id);
            d.put({ ...next, id: nid }, idx);
            continue;
          }
        }
        d.update(other.id, next);
      } else if (other.type === 'frame' && other.members.includes(id)) {
        d.update(other.id, { members: other.members.map((m) => (m === id ? rename : m)) });
      }
    }
  });
  return rename ?? id;
}

export type Restack = 'front' | 'back' | 'forward' | 'backward';

export function restack(store: Store, ids: Id[], how: Restack) {
  const order = store.get().elements.map((e) => e.id);
  const sel = new Set(ids);
  let next: Id[];
  if (how === 'front') next = [...order.filter((i) => !sel.has(i)), ...order.filter((i) => sel.has(i))];
  else if (how === 'back') next = [...order.filter((i) => sel.has(i)), ...order.filter((i) => !sel.has(i))];
  else {
    next = [...order];
    const step = how === 'forward' ? 1 : -1;
    const idxs = next.map((id, i) => (sel.has(id) ? i : -1)).filter((i) => i >= 0);
    if (step === 1) idxs.reverse();
    for (const i of idxs) {
      const j = i + step;
      if (j < 0 || j >= next.length || sel.has(next[j]!)) continue;
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
  }
  store.transact((d) => d.reorder(next));
}
