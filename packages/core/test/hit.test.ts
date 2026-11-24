import { expect, test } from 'vitest';
import { elementsInRect, hitTest } from '../src/hit';
import type { Board, Element } from '../src';

const S = { rot: 0, stroke: 'ink', fill: 'none', width: 2, dash: 'solid' } as const;
const node = (id: string, type: string, x: number, y: number, w = 100, h = 100, extra = {}): Element =>
  ({ id, type, x, y, w, h, ...S, ...extra }) as Element;
const board = (...elements: Element[]): Board => ({ version: 1, sketch: 0, elements, trailingComments: [] });

test('topmost element wins', () => {
  const b = board(node('a', 'box', 0, 0), node('b', 'box', 50, 50));
  expect(hitTest(b, { x: 60, y: 60 })).toBe('b');
  expect(hitTest(b, { x: 10, y: 10 })).toBe('a');
  expect(hitTest(b, { x: 500, y: 500 })).toBeUndefined();
});

test('ellipse and diamond use their real outline', () => {
  const b = board(node('e', 'ellipse', 0, 0), node('d', 'diamond', 200, 0));
  expect(hitTest(b, { x: 50, y: 50 })).toBe('e');
  expect(hitTest(b, { x: 2, y: 2 }, 0)).toBeUndefined();
  expect(hitTest(b, { x: 250, y: 50 })).toBe('d');
  expect(hitTest(b, { x: 205, y: 5 }, 0)).toBeUndefined();
});

test('frames are hit on their border and label, not inside', () => {
  const b = board(node('f', 'frame', 0, 0, 400, 300, { name: 'F', members: [] }));
  expect(hitTest(b, { x: 200, y: 150 })).toBeUndefined();
  expect(hitTest(b, { x: 1, y: 150 })).toBe('f');
  expect(hitTest(b, { x: 10, y: -12 })).toBe('f');
});

test('rotated nodes are tested in local space', () => {
  const b = board(node('r', 'box', 0, 0, 200, 20, { rot: 90 }));
  expect(hitTest(b, { x: 100, y: 90 })).toBe('r');
  expect(hitTest(b, { x: 10, y: 10 }, 0)).toBeUndefined();
});

test('connectors are hit near their path', () => {
  const b = board(
    node('a', 'box', 0, 0),
    node('b', 'box', 300, 0),
    { id: 'a-b', type: 'arrow', from: { id: 'a' }, to: { id: 'b' }, head: 'end', route: 'straight', ...S } as Element,
  );
  expect(hitTest(b, { x: 200, y: 53 })).toBe('a-b');
  expect(hitTest(b, { x: 200, y: 80 })).toBeUndefined();
});

test('ink is hit near its stroke', () => {
  const b = board({ id: '~inkaaa', type: 'ink', x: 0, y: 0, w: 0, h: 0, pts: [[0, 0, 0.5], [100, 0, 0.5]], ...S } as Element);
  expect(hitTest(b, { x: 50, y: 3 })).toBe('~inkaaa');
  expect(hitTest(b, { x: 50, y: 40 })).toBeUndefined();
});

test('unplaced nodes are ignored', () => {
  expect(hitTest(board({ ...node('a', 'box', 0, 0), x: undefined, y: undefined } as Element), { x: 1, y: 1 })).toBeUndefined();
});

test('elementsInRect returns fully contained elements', () => {
  const b = board(node('a', 'box', 0, 0), node('b', 'box', 150, 0), node('c', 'box', 1000, 0));
  expect(elementsInRect(b, { x: -10, y: -10, w: 300, h: 200 })).toEqual(['a', 'b']);
  expect(elementsInRect(b, { x: -10, y: -10, w: 200, h: 200 })).toEqual(['a']);
});
