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

export function createStore(initial: Board, opts: { historyLimit?: number } = {}): Store {
  const limit = opts.historyLimit ?? 200;
  let board = initial;
  let undoStack: { board: Board; mergeKey?: string }[] = [];
  let redoStack: Board[] = [];
  const listeners = new Set<Listener>();

  const commit = (next: Board, o: TransactOptions = {}) => {
    if (next === board) return;
    const prev = board;
    if (o.history !== false) {
      const last = undoStack[undoStack.length - 1];
      if (!(o.mergeKey !== undefined && last?.mergeKey === o.mergeKey)) {
        undoStack.push({ board: prev, mergeKey: o.mergeKey });
        if (undoStack.length > limit) undoStack = undoStack.slice(-limit);
      }
      redoStack = [];
    }
    board = next;
    for (const l of [...listeners]) l(board, prev);
  };

  return {
    get: () => board,
    transact(fn, o) {
      const order = board.elements.map((e) => e.id);
      const byId = new Map(board.elements.map((e) => [e.id, e]));
      let header: Partial<Board> = {};
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
          const next = [...listed, ...order.filter((id) => !set.has(id))];
          order.splice(0, order.length, ...next);
          changed = true;
        },
        setBoard(patch) {
          header = { ...header, ...patch };
          changed = true;
        },
      };
      fn(draft);
      if (!changed) return;
      commit({ ...board, ...header, elements: order.map((id) => byId.get(id)!) }, o);
    },
    replace(next, o) {
      commit(next, o);
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      redoStack.push(board);
      const prev = board;
      board = entry.board;
      for (const l of [...listeners]) l(board, prev);
      return true;
    },
    redo() {
      const next = redoStack.pop();
      if (!next) return false;
      undoStack.push({ board });
      const prev = board;
      board = next;
      for (const l of [...listeners]) l(board, prev);
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
