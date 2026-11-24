import { describe, expect, test, vi } from 'vitest';
import { createStore } from '../src/store';
import { emptyBoard, type Board, type Element } from '../src';

const box = (id: string, extra: Partial<Element> = {}): Element =>
  ({ id, type: 'box', x: 0, y: 0, w: 160, h: 80, rot: 0, stroke: 'ink', fill: 'none', width: 2, dash: 'solid', ...extra }) as Element;
const ids = (b: Board) => b.elements.map((e) => e.id);

describe('store', () => {
  test('put, update, remove produce new immutable boards', () => {
    const s = createStore(emptyBoard());
    const b0 = s.get();
    s.transact((d) => {
      d.put(box('a'));
      d.put(box('b'));
    });
    const b1 = s.get();
    expect(ids(b1)).toEqual(['a', 'b']);
    expect(b0.elements).toEqual([]);
    s.transact((d) => d.update('a', { x: 50, label: 'A' } as Partial<Element>));
    expect(s.get().elements[0]).toMatchObject({ x: 50, label: 'A' });
    expect(b1.elements[0]).toMatchObject({ x: 0 });
    expect(s.get().elements[1]).toBe(b1.elements[1]); // untouched elements are shared
    s.transact((d) => d.remove('a'));
    expect(ids(s.get())).toEqual(['b']);
  });

  test('update with undefined deletes the key', () => {
    const s = createStore({ ...emptyBoard(), elements: [box('a', { label: 'x' } as Partial<Element>)] });
    s.transact((d) => d.update('a', { label: undefined } as Partial<Element>));
    expect('label' in s.get().elements[0]!).toBe(false);
  });

  test('put at index and reorder', () => {
    const s = createStore(emptyBoard());
    s.transact((d) => {
      d.put(box('a'));
      d.put(box('b'));
      d.put(box('c'), 0);
    });
    expect(ids(s.get())).toEqual(['c', 'a', 'b']);
    s.transact((d) => d.reorder(['b', 'c', 'a']));
    expect(ids(s.get())).toEqual(['b', 'c', 'a']);
  });

  test('undo and redo; new edits clear redo', () => {
    const s = createStore(emptyBoard());
    s.transact((d) => d.put(box('a')));
    s.transact((d) => d.update('a', { x: 10 }));
    expect(s.undo()).toBe(true);
    expect(s.get().elements[0]).toMatchObject({ x: 0 });
    expect(s.redo()).toBe(true);
    expect(s.get().elements[0]).toMatchObject({ x: 10 });
    s.undo();
    s.transact((d) => d.update('a', { y: 5 }));
    expect(s.canRedo()).toBe(false);
    s.undo();
    s.undo();
    expect(s.get().elements).toEqual([]);
    expect(s.undo()).toBe(false);
  });

  test('mergeKey coalesces a gesture into one undo step', () => {
    const s = createStore({ ...emptyBoard(), elements: [box('a')] });
    for (let x = 1; x <= 5; x++) s.transact((d) => d.update('a', { x }), { mergeKey: 'drag-1' });
    s.transact((d) => d.update('a', { y: 9 }), { mergeKey: 'drag-2' });
    s.undo();
    expect(s.get().elements[0]).toMatchObject({ x: 5, y: 0 });
    s.undo();
    expect(s.get().elements[0]).toMatchObject({ x: 0 });
  });

  test('no-op transactions do not notify or record history', () => {
    const s = createStore(emptyBoard());
    const cb = vi.fn();
    s.subscribe(cb);
    s.transact(() => {});
    expect(cb).not.toHaveBeenCalled();
    expect(s.canUndo()).toBe(false);
  });

  test('subscribe and unsubscribe', () => {
    const s = createStore(emptyBoard());
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.transact((d) => d.put(box('a')));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    s.transact((d) => d.put(box('b')));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('history: false skips undo; replace is undoable', () => {
    const s = createStore(emptyBoard());
    s.transact((d) => d.put(box('a')), { history: false });
    expect(s.canUndo()).toBe(false);
    s.replace({ ...emptyBoard(), sketch: 1, elements: [box('z')] });
    expect(ids(s.get())).toEqual(['z']);
    expect(s.get().sketch).toBe(1);
    s.undo();
    expect(ids(s.get())).toEqual(['a']);
  });

  test('history is capped', () => {
    const s = createStore({ ...emptyBoard(), elements: [box('a')] }, { historyLimit: 3 });
    for (let x = 1; x <= 10; x++) s.transact((d) => d.update('a', { x }));
    let n = 0;
    while (s.undo()) n++;
    expect(n).toBe(3);
  });

  test('update of a missing id throws', () => {
    const s = createStore(emptyBoard());
    expect(() => s.transact((d) => d.update('nope', { x: 1 }))).toThrow(/nope/);
  });
});

describe('undo only reverts your own changes', () => {
  test('a remote edit to another element survives local undo', () => {
    const s = createStore({ ...emptyBoard(), elements: [box('a'), box('b')] });
    s.transact((d) => d.update('a', { x: 10 }));
    s.transact((d) => d.update('b', { x: 99 }), { history: false }); // remote
    s.undo();
    expect(s.get().elements.map((e) => (e as { x: number }).x)).toEqual([0, 99]);
    s.redo();
    expect(s.get().elements.map((e) => (e as { x: number }).x)).toEqual([10, 99]);
  });

  test('undo of a create removes it; remote inserts keep their place', () => {
    const s = createStore(emptyBoard());
    s.transact((d) => d.put(box('mine')));
    s.transact((d) => d.put(box('theirs')), { history: false });
    s.undo();
    expect(ids(s.get())).toEqual(['theirs']);
    s.redo();
    expect(ids(s.get())).toEqual(['mine', 'theirs']);
  });

  test('undo of a delete restores at the old index', () => {
    const s = createStore({ ...emptyBoard(), elements: [box('a'), box('b'), box('c')] });
    s.transact((d) => d.remove('b'));
    s.undo();
    expect(ids(s.get())).toEqual(['a', 'b', 'c']);
  });
});

test('undoing a move does not revert a remote reorder', () => {
  const s = createStore({ ...emptyBoard(), elements: [box('a'), box('b'), box('c')] });
  s.transact((d) => d.update('a', { x: 5 }));
  s.transact((d) => d.reorder(['c', 'b', 'a']), { history: false });
  s.undo();
  expect(ids(s.get())).toEqual(['c', 'b', 'a']);
  expect((s.get().elements[2] as { x: number }).x).toBe(0);
});

test('undoing a local reorder restores the order', () => {
  const s = createStore({ ...emptyBoard(), elements: [box('a'), box('b'), box('c')] });
  s.transact((d) => d.reorder(['c', 'a', 'b']));
  s.undo();
  expect(ids(s.get())).toEqual(['a', 'b', 'c']);
});
