import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { createStore, createSync, emptyBoard, type Board, type Element, type Op, type Store, type Sync } from '../src';

const box = (id: string, x = 0): Element =>
  ({ id, type: 'box', x, y: 0, w: 160, h: 80, rot: 0, stroke: 'ink', fill: 'none', width: 2, dash: 'solid' }) as Element;

/** N clients behind a relay that totally orders messages; delivery is manual. */
function network(n: number) {
  let tick = 1_000;
  const now = () => tick;
  const log: { from: number; ops: Op[] }[] = [];
  const delivered = Array(n).fill(0) as number[];
  const stores: Store[] = [];
  const syncs: Sync[] = [];
  for (let i = 0; i < n; i++) {
    const s = createStore(emptyBoard());
    stores.push(s);
    syncs.push(createSync(s, `c${i}`, (ops) => log.push({ from: i, ops }), now));
  }
  const deliver = (i: number, count = Infinity) => {
    while (count-- > 0 && delivered[i]! < log.length) {
      const m = log[delivered[i]!++]!;
      if (m.from !== i) syncs[i]!.receive(m.ops);
    }
  };
  return { stores, syncs, deliver, advance: (ms = 1) => (tick += ms), log };
}

const state = (b: Board) => JSON.stringify([...b.elements].sort((a, c) => (a.id < c.id ? -1 : 1)));

describe('sync', () => {
  test('creates, edits and deletes propagate', () => {
    const net = network(2);
    const [a, b] = net.stores as [Store, Store];
    a.transact((d) => d.put(box('x')));
    net.deliver(1);
    expect(b.get().elements.map((e) => e.id)).toEqual(['x']);
    b.transact((d) => d.update('x', { x: 50 }));
    net.deliver(0);
    expect((a.get().elements[0] as { x: number }).x).toBe(50);
    a.transact((d) => d.remove('x'));
    net.deliver(1);
    expect(b.get().elements).toEqual([]);
  });

  test('concurrent edits to different properties both survive', () => {
    const net = network(2);
    const [a, b] = net.stores as [Store, Store];
    a.transact((d) => d.put(box('x')));
    net.deliver(1);
    a.transact((d) => d.update('x', { x: 10 }));
    b.transact((d) => d.update('x', { label: 'B' }));
    net.deliver(0);
    net.deliver(1);
    expect(a.get().elements[0]).toMatchObject({ x: 10, label: 'B' });
    expect(state(a.get())).toBe(state(b.get()));
  });

  test('remote changes are not undoable locally', () => {
    const net = network(2);
    const [a, b] = net.stores as [Store, Store];
    a.transact((d) => d.put(box('x')));
    net.deliver(1);
    expect(b.canUndo()).toBe(false);
  });

  test('snapshot lets a late joiner catch up', () => {
    const net = network(2);
    const [a, b] = net.stores as [Store, Store];
    a.transact((d) => d.put(box('x', 7)));
    const snap = JSON.parse(JSON.stringify(net.syncs[0]!.snapshot()));
    net.syncs[1]!.load(snap);
    expect(state(b.get())).toBe(state(a.get()));
  });

  test('random concurrent sessions converge (property)', () => {
    const action = fc.tuple(
      fc.integer({ min: 0, max: 2 }), // client
      fc.constantFrom('add', 'move', 'label', 'del', 'front', 'deliver', 'undo'),
      fc.integer({ min: 0, max: 4 }), // element index
      fc.integer({ min: -50, max: 50 }),
    );
    fc.assert(
      fc.property(fc.array(action, { minLength: 1, maxLength: 60 }), (actions) => {
        const net = network(3);
        for (const [c, kind, i, v] of actions) {
          const s = net.stores[c]!;
          const id = `e${i}`;
          const has = s.get().elements.some((e) => e.id === id);
          net.advance(Math.abs(v) % 3);
          if (kind === 'add' && !has) s.transact((d) => d.put(box(id, v)));
          else if (kind === 'move' && has) s.transact((d) => d.update(id, { x: v }));
          else if (kind === 'label' && has) s.transact((d) => d.update(id, { label: `l${v}` }));
          else if (kind === 'del' && has) s.transact((d) => d.remove(id));
          else if (kind === 'front' && has) s.transact((d) => d.reorder([...s.get().elements.map((e) => e.id).filter((x) => x !== id), id]));
          else if (kind === 'undo') s.undo();
          else if (kind === 'deliver') net.deliver(c, Math.abs(v) % 4);
        }
        for (let i = 0; i < 3; i++) net.deliver(i);
        const [a, b, c] = net.stores.map((s) => state(s.get()));
        expect(b).toBe(a);
        expect(c).toBe(a);
      }),
      { numRuns: 300 },
    );
  }, 30_000);
});
