import type { Board, Element, Id } from './schema';

export interface Draft {
  get(id: Id): Element | undefined;
  /** Insert (at index, default top) or replace an element. */
  put(el: Element, index?: number): void;
  /** Shallow-merge a patch; keys set to undefined are removed. */
  update(id: Id, patch: Partial<Element> | Record<string, unknown>): void;
  remove(id: Id): void;
  /** Set paint order; ids not listed keep their relative order at the end. */
  reorder(ids: Id[]): void;
  setBoard(patch: Partial<Omit<Board, 'elements' | 'version'>>): void;
}

export interface TransactOptions {
  /** Consecutive transactions with the same key collapse into one undo step. */
  mergeKey?: string;
  /** false = not undoable (loading, remote changes). Default true. */
  history?: boolean;
}

export type Listener = (board: Board, prev: Board) => void;

export interface Store {
  get(): Board;
  transact(fn: (d: Draft) => void, opts?: TransactOptions): void;
  replace(board: Board, opts?: TransactOptions): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(cb: Listener): () => void;
}

/** The minimal change between two boards: element versions before/after, order, header. */
interface Patch {
  before: Map<Id, Element | undefined>;
  after: Map<Id, Element | undefined>;
  orderBefore: Id[];
  orderAfter: Id[];
  headerBefore: Omit<Board, 'elements'>;
  headerAfter: Omit<Board, 'elements'>;
}

const header = (b: Board): Omit<Board, 'elements'> => {
  const { elements: _e, ...rest } = b;
  return rest;
};

function diff(prev: Board, next: Board): Patch {
  const before = new Map<Id, Element | undefined>();
  const after = new Map<Id, Element | undefined>();
  const p = new Map(prev.elements.map((e) => [e.id, e]));
  const n = new Map(next.elements.map((e) => [e.id, e]));
  for (const [id, el] of n) if (p.get(id) !== el) (before.set(id, p.get(id)), after.set(id, el));
  for (const [id, el] of p) if (!n.has(id)) (before.set(id, el), after.set(id, undefined));
  return {
    before, after,
    orderBefore: prev.elements.map((e) => e.id), orderAfter: next.elements.map((e) => e.id),
    headerBefore: header(prev), headerAfter: header(next),
  };
}

/**
 * Applies one side of a patch onto the *current* board, leaving elements the patch did not
 * touch (e.g. remote edits) alone. Restored elements go back to their old relative position.
 */
function applySide(cur: Board, els: Map<Id, Element | undefined>, order: Id[], reordered: boolean, hdr: Omit<Board, 'elements'>, otherHdr: Omit<Board, 'elements'>): Board {
  const byId = new Map(cur.elements.map((e) => [e.id, e]));
  for (const [id, el] of els) (el ? byId.set(id, el) : byId.delete(id));
  const ids = cur.elements.map((e) => e.id).filter((id) => byId.has(id));
  const present = new Set(ids);
  // insert restored ids after their nearest predecessor in the target order
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    if (present.has(id) || !byId.has(id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = ids.indexOf(order[j]!);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    ids.splice(at, 0, id);
    present.add(id);
  }
  // if this patch reordered existing elements, restore that relative order for them
  const touched = new Set(order.filter((id) => present.has(id)));
  const curRel = ids.filter((id) => touched.has(id));
  const wantRel = order.filter((id) => touched.has(id));
  let final = ids;
  if (reordered && curRel.join('\0') !== wantRel.join('\0')) {
    let k = 0;
    final = ids.map((id) => (touched.has(id) ? wantRel[k++]! : id));
  }
  const h = { ...cur } as Record<string, unknown>;
  for (const key of new Set([...Object.keys(hdr), ...Object.keys(otherHdr)])) {
    const a = (hdr as Record<string, unknown>)[key];
    if (a !== (otherHdr as Record<string, unknown>)[key]) {
      if (a === undefined) delete h[key];
      else h[key] = a;
    }
  }
  return { ...(h as unknown as Board), elements: final.map((id) => byId.get(id)!) };
}

/** True when the patch changed the relative order of elements that existed on both sides. */
function reorders(p: Patch): boolean {
  const a = new Set(p.orderAfter);
  const b = new Set(p.orderBefore);
  return p.orderBefore.filter((id) => a.has(id)).join('\0') !== p.orderAfter.filter((id) => b.has(id)).join('\0');
}

export function createStore(initial: Board, opts: { historyLimit?: number } = {}): Store {
  const limit = opts.historyLimit ?? 200;
  let board = initial;
  let undoStack: { patch: Patch; mergeKey?: string }[] = [];
  let redoStack: Patch[] = [];
  const listeners = new Set<Listener>();
  const emit = (prev: Board) => {
    for (const l of [...listeners]) l(board, prev);
  };

  const commit = (next: Board, o: TransactOptions = {}) => {
    if (next === board) return;
    const prev = board;
    if (o.history !== false) {
      const patch = diff(prev, next);
      const last = undoStack[undoStack.length - 1];
      if (o.mergeKey !== undefined && last?.mergeKey === o.mergeKey) {
        // extend the gesture: keep the earliest "before", take the latest "after"
        for (const [id, el] of patch.after) {
          if (!last.patch.before.has(id)) last.patch.before.set(id, patch.before.get(id));
          last.patch.after.set(id, el);
        }
        last.patch.orderAfter = patch.orderAfter;
        last.patch.headerAfter = patch.headerAfter;
      } else {
        undoStack.push({ patch, mergeKey: o.mergeKey });
        if (undoStack.length > limit) undoStack = undoStack.slice(-limit);
      }
      redoStack = [];
    }
    board = next;
    emit(prev);
  };

  return {
    get: () => board,
    transact(fn, o) {
      const order = board.elements.map((e) => e.id);
      const byId = new Map(board.elements.map((e) => [e.id, e]));
      let hdr: Partial<Board> = {};
      let changed = false;
      const draft: Draft = {
        get: (id) => byId.get(id),
        put(el, index) {
          if (byId.has(el.id)) order.splice(order.indexOf(el.id), 1);
          order.splice(index === undefined ? order.length : Math.max(0, Math.min(index, order.length)), 0, el.id);
          byId.set(el.id, el);
          changed = true;
        },
        update(id, patch) {
          const cur = byId.get(id);
          if (!cur) throw new Error(`no element '${id}'`);
          const next = { ...cur } as Record<string, unknown>;
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete next[k];
            else next[k] = v;
          }
          byId.set(id, next as unknown as Element);
          changed = true;
        },
        remove(id) {
          if (!byId.delete(id)) return;
          order.splice(order.indexOf(id), 1);
          changed = true;
        },
        reorder(ids) {
          const listed = ids.filter((id) => byId.has(id));
          const set = new Set(listed);
          order.splice(0, order.length, ...listed, ...order.filter((id) => !set.has(id)));
          changed = true;
        },
        setBoard(patch) {
          hdr = { ...hdr, ...patch };
          changed = true;
        },
      };
      fn(draft);
      if (!changed) return;
      commit({ ...board, ...hdr, elements: order.map((id) => byId.get(id)!) }, o);
    },
    replace(next, o) {
      commit(next, o);
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      const { patch } = entry;
      const prev = board;
      board = applySide(board, patch.before, patch.orderBefore, reorders(patch), patch.headerBefore, patch.headerAfter);
      redoStack.push(patch);
      emit(prev);
      return true;
    },
    redo() {
      const patch = redoStack.pop();
      if (!patch) return false;
      const prev = board;
      board = applySide(board, patch.after, patch.orderAfter, reorders(patch), patch.headerAfter, patch.headerBefore);
      undoStack.push({ patch });
      emit(prev);
      return true;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
