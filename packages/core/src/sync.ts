import type { Board, Element, Id } from './schema';
import type { Store } from './store';

/**
 * Real-time sync: local store changes become per-property last-writer-wins ops; remote ops are
 * applied when their timestamp beats the local clock for that property. Timestamps are hybrid
 * logical clocks (`ms.counter.client`, fixed width) so string comparison is a total order.
 */
export type Op =
  | { k: 'put'; id: Id; el: Element; t: string }
  | { k: 'set'; id: Id; p: string; v: unknown; t: string }
  | { k: 'del'; id: Id; t: string }
  | { k: 'order'; ids: Id[]; t: string }
  | { k: 'board'; p: string; v: unknown; t: string };

export interface SyncSnapshot {
  board: Board;
  clocks: Record<string, string>;
  tombs: Record<Id, string>;
}

export interface Sync {
  /** Apply ops from another client (never re-broadcast). */
  receive(ops: Op[]): void;
  snapshot(): SyncSnapshot;
  /** Replace local state with a snapshot (joining a room). */
  load(s: SyncSnapshot): void;
  stop(): void;
}

const key = (id: Id, p: string) => `${id}\u0000${p}`;
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const ORDER = '\u0000order';

export function createClock(clientId: string, now: () => number = Date.now) {
  let ms = 0;
  let n = 0;
  const fmt = () => `${ms.toString(36).padStart(9, '0')}.${n.toString(36).padStart(4, '0')}.${clientId}`;
  return {
    next(): string {
      const t = now();
      if (t > ms) {
        ms = t;
        n = 0;
      } else n++;
      return fmt();
    },
    /** Advance past a remote timestamp so our next stamp is later. */
    observe(t: string) {
      const [m, c] = t.split('.');
      const rm = parseInt(m!, 36);
      const rc = parseInt(c!, 36);
      if (rm > ms || (rm === ms && rc > n)) {
        ms = rm;
        n = rc;
      }
    },
  };
}

export function createSync(store: Store, clientId: string, send: (ops: Op[]) => void, now?: () => number): Sync {
  const clock = createClock(clientId, now);
  let clocks = new Map<string, string>();
  let tombs = new Map<Id, string>();
  const graveyard = new Map<Id, Element>();
  let applying = false;

  const newer = (k: string, t: string) => (clocks.get(k) ?? '') < t;
  const maxClock = (id: Id) => {
    let m = '';
    for (const [k, t] of clocks) if (k.startsWith(`${id}\u0000`) && t > m) m = t;
    return m;
  };

  // ---- local → ops ----
  const off = store.subscribe((next, prev) => {
    if (applying) return;
    const ops: Op[] = [];
    const p = new Map(prev.elements.map((e) => [e.id, e]));
    const n = new Map(next.elements.map((e) => [e.id, e]));
    for (const [id, el] of n) {
      const old = p.get(id);
      if (old === el) continue;
      if (!old) {
        const t = clock.next();
        for (const prop of Object.keys(el)) clocks.set(key(id, prop), t);
        tombs.delete(id);
        ops.push({ k: 'put', id, el, t });
        continue;
      }
      const a = old as unknown as Record<string, unknown>;
      const b = el as unknown as Record<string, unknown>;
      for (const prop of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (same(a[prop], b[prop])) continue;
        const t = clock.next();
        clocks.set(key(id, prop), t);
        ops.push({ k: 'set', id, p: prop, v: b[prop] ?? null, t });
      }
    }
    for (const [id, el] of p) {
      if (n.has(id)) continue;
      const t = clock.next();
      tombs.set(id, t);
      graveyard.set(id, el);
      ops.push({ k: 'del', id, t });
    }
    // order: only when not explained by appends/removals
    const kept = prev.elements.map((e) => e.id).filter((id) => n.has(id));
    const added = next.elements.map((e) => e.id).filter((id) => !p.has(id));
    const nextIds = next.elements.map((e) => e.id);
    if (nextIds.join('\0') !== [...kept, ...added].join('\0')) {
      const t = clock.next();
      clocks.set(ORDER, t);
      ops.push({ k: 'order', ids: nextIds, t });
    }
    for (const prop of ['sketch', 'bg', 'grid', 'trailingComments'] as const) {
      if (same(prev[prop], next[prop])) continue;
      const t = clock.next();
      clocks.set(key('', prop), t);
      ops.push({ k: 'board', p: prop, v: next[prop] ?? null, t });
    }
    if (ops.length) send(ops);
  });

  // ---- ops → local ----
  const receive = (ops: Op[]) => {
    applying = true;
    try {
      store.transact(
        (d) => {
          for (const op of ops) {
            clock.observe(op.t);
            switch (op.k) {
              case 'put': {
                const tomb = tombs.get(op.id);
                if (tomb && tomb >= op.t) break;
                const cur = d.get(op.id) ?? graveyard.get(op.id);
                const live = !!d.get(op.id);
                const next = { ...(cur ?? {}) } as Record<string, unknown>;
                const incoming = op.el as unknown as Record<string, unknown>;
                for (const prop of new Set([...Object.keys(next), ...Object.keys(incoming)])) {
                  if (!newer(key(op.id, prop), op.t)) continue;
                  clocks.set(key(op.id, prop), op.t);
                  if (incoming[prop] === undefined) delete next[prop];
                  else next[prop] = incoming[prop];
                }
                tombs.delete(op.id);
                graveyard.delete(op.id);
                if (live) d.update(op.id, next);
                else d.put(next as unknown as Element);
                break;
              }
              case 'set': {
                const k = key(op.id, op.p);
                if (!newer(k, op.t)) break;
                clocks.set(k, op.t);
                const v = op.v === null ? undefined : op.v;
                if (d.get(op.id)) d.update(op.id, { [op.p]: v });
                else {
                  // edit after a delete: resurrect when the edit is newer than the delete
                  const ghost = graveyard.get(op.id);
                  const tomb = tombs.get(op.id);
                  if (ghost && tomb && op.t > tomb) {
                    tombs.delete(op.id);
                    graveyard.delete(op.id);
                    d.put({ ...ghost, [op.p]: v } as Element);
                  }
                }
                break;
              }
              case 'del': {
                const el = d.get(op.id);
                if ((tombs.get(op.id) ?? '') >= op.t) break;
                if (el && maxClock(op.id) > op.t) break; // a newer edit wins over the delete
                tombs.set(op.id, op.t);
                if (el) {
                  graveyard.set(op.id, el);
                  d.remove(op.id);
                }
                break;
              }
              case 'order':
                if (!newer(ORDER, op.t)) break;
                clocks.set(ORDER, op.t);
                d.reorder(op.ids);
                break;
              case 'board': {
                const k = key('', op.p);
                if (!newer(k, op.t)) break;
                clocks.set(k, op.t);
                d.setBoard({ [op.p]: op.v === null ? undefined : op.v } as Partial<Board>);
                break;
              }
            }
          }
        },
        { history: false },
      );
    } finally {
      applying = false;
    }
  };

  return {
    receive,
    snapshot: () => ({ board: store.get(), clocks: Object.fromEntries(clocks), tombs: Object.fromEntries(tombs) }),
    load(s) {
      clocks = new Map(Object.entries(s.clocks));
      tombs = new Map(Object.entries(s.tombs));
      for (const t of clocks.values()) clock.observe(t);
      applying = true;
      try {
        store.replace(s.board, { history: false });
      } finally {
        applying = false;
      }
    },
    stop: () => off(),
  };
}
