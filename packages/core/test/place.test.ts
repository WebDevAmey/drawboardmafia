import { expect, test } from 'vitest';
import { layeredLayout, placeUnpositioned } from '../src/place';
import { bounds, overlaps, type Board, type Element, type NodeEl } from '../src';

const box = (id: string, x?: number, y?: number): Element => ({
  id, type: 'box', x, y, w: 160, h: 80, rot: 0, stroke: 'ink', fill: 'none', width: 2, dash: 'solid',
});
const arrow = (from: string, to: string): Element => ({
  id: `${from}-${to}`, type: 'arrow', from: { id: from }, to: { id: to }, head: 'end', route: 'straight',
  stroke: 'ink', fill: 'none', width: 2, dash: 'solid',
});
const board = (...elements: Element[]): Board => ({ version: 1, sketch: 0, elements, trailingComments: [] });
const node = (b: Board, id: string) => b.elements.find((e) => e.id === id) as NodeEl;

test('placed nodes never move, and input is not mutated', () => {
  const input = board(box('a', 10, 20), box('b'));
  const out = placeUnpositioned(input);
  expect(node(out, 'a')).toMatchObject({ x: 10, y: 20 });
  expect(node(input, 'b').x).toBeUndefined();
});

test('connected node goes right of its placed neighbour without overlap', () => {
  const out = placeUnpositioned(board(box('api', 0, 0), box('blocker', 208, 0), box('cache'), arrow('api', 'cache')));
  const c = bounds(node(out, 'cache'))!;
  expect(c.x).toBe(208);
  expect(overlaps(c, bounds(node(out, 'blocker'))!)).toBe(false);
  expect(overlaps(c, bounds(node(out, 'api'))!)).toBe(false);
});

test('incoming edge places node to the left', () => {
  const out = placeUnpositioned(board(box('db', 500, 0), box('api'), arrow('api', 'db')));
  expect(node(out, 'api')).toMatchObject({ x: 500 - 160 - 48, y: 0 });
});

test('chains of unplaced nodes follow each other', () => {
  const out = placeUnpositioned(board(box('a', 0, 0), box('b'), box('c'), arrow('a', 'b'), arrow('b', 'c')));
  expect(node(out, 'b').x!).toBeLessThan(node(out, 'c').x!);
});

test('disconnected nodes go in a grid below everything', () => {
  const out = placeUnpositioned(board(box('a', 0, 0), box('x'), box('y')));
  expect(node(out, 'x')).toMatchObject({ x: 0, y: 80 + 96 });
  expect(node(out, 'y')).toMatchObject({ x: 208, y: 80 + 96 });
});

test('unplaced frame wraps its members', () => {
  const frame: Element = { id: 'f', type: 'frame', name: '', members: ['a'], w: 400, h: 300, rot: 0, stroke: 'ink', fill: 'none', width: 2, dash: 'solid' };
  const out = placeUnpositioned(board(box('a', 100, 100), frame));
  expect(node(out, 'f')).toMatchObject({ x: 60, y: 60, w: 240, h: 160 });
});

test('layered layout LR ranks along x; TB along y', () => {
  const b = board(box('a'), box('b'), box('c'), box('d'), arrow('a', 'b'), arrow('b', 'c'), arrow('a', 'd'));
  const lr = layeredLayout(b, 'LR');
  expect(node(lr, 'a').x!).toBeLessThan(node(lr, 'b').x!);
  expect(node(lr, 'b').x!).toBeLessThan(node(lr, 'c').x!);
  expect(node(lr, 'b').x).toBe(node(lr, 'd').x);
  expect(node(lr, 'b').y).not.toBe(node(lr, 'd').y);
  const tb = layeredLayout(b, 'TB');
  expect(node(tb, 'a').y!).toBeLessThan(node(tb, 'b').y!);
  const rl = layeredLayout(b, 'RL');
  expect(node(rl, 'a').x!).toBeGreaterThan(node(rl, 'b').x!);
});

test('layered layout terminates on cycles', () => {
  const out = layeredLayout(board(box('a'), box('b'), arrow('a', 'b'), arrow('b', 'a')), 'LR');
  expect(node(out, 'a').x!).toBeLessThan(node(out, 'b').x!);
});

test('grid wraps into rows', () => {
  const many = Array.from({ length: 10 }, (_, i) => box(`n${i}`));
  const out = placeUnpositioned(board(...many));
  const ys = new Set(out.elements.map((e) => (e as NodeEl).y));
  expect(ys.size).toBeGreaterThan(1);
  for (const e of out.elements) expect((e as NodeEl).x!).toBeLessThanOrEqual(1200);
});
