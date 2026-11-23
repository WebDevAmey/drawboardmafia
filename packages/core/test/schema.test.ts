import { describe, expect, test } from 'vitest';
import { bounds, defaultSize, isColor, isConnector, isNode, isValidId, type Element } from '../src';

describe('ids', () => {
  test.each(['api', 'api-2', 'a_b', '~a8f3kq'])('accepts %s', (id) => {
    expect(isValidId(id)).toBe(true);
  });
  test.each(['Api', '2a', '~abc', '', 'a b', '~ABCDEF'])('rejects %s', (id) => {
    expect(isValidId(id)).toBe(false);
  });
});

test('default sizes', () => {
  expect(defaultSize('box')).toEqual({ w: 160, h: 80 });
  expect(defaultSize('note')).toEqual({ w: 200, h: 200 });
});

test('colors', () => {
  expect(isColor('blue')).toBe(true);
  expect(isColor('#aabbcc')).toBe(true);
  expect(isColor('#abc')).toBe(false);
  expect(isColor('purple')).toBe(false);
});

test('node vs connector', () => {
  const box: Element = {
    id: 'a', type: 'box', w: 160, h: 80, rot: 0,
    stroke: 'ink', fill: 'none', width: 2, dash: 'solid',
  };
  const arrow: Element = {
    id: 'a-b', type: 'arrow', from: { id: 'a' }, to: { id: 'b' }, head: 'end', route: 'straight',
    stroke: 'ink', fill: 'none', width: 2, dash: 'solid',
  };
  expect(isNode(box)).toBe(true);
  expect(isConnector(arrow)).toBe(true);
  expect(isNode(arrow)).toBe(false);
});

test('bounds', () => {
  const base = { stroke: 'ink', fill: 'none', width: 2, dash: 'solid', rot: 0 } as const;
  expect(bounds({ ...base, id: 'a', type: 'box', w: 10, h: 20 })).toBeNull();
  expect(bounds({ ...base, id: 'a', type: 'box', x: 1, y: 2, w: 10, h: 20 })).toEqual({ x: 1, y: 2, w: 10, h: 20 });
  expect(
    bounds({ ...base, id: '~aaaaaa', type: 'ink', x: 100, y: 100, w: 0, h: 0, pts: [[0, 0, 0.5], [10, -5, 0.5], [20, 30, 0.5]] }),
  ).toEqual({ x: 100, y: 95, w: 20, h: 35 });
});
