import { expect, test } from 'vitest';
import fc from 'fast-check';
import { decodeInk, encodeInk } from '../src/ink';

test('no-pressure strokes decode to 0.5', () => {
  const s = encodeInk([[0, 0, 0.5], [10, -5, 0.5], [3, 400, 0.5]]);
  expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeInk(s)).toEqual([[0, 0, 0.5], [10, -5, 0.5], [3, 400, 0.5]]);
});

test('rounds coordinates and quantizes pressure', () => {
  const out = decodeInk(encodeInk([[0.4, 1.6, 0.2], [-3.5, 2, 1]]));
  expect(out[0]![0]).toBe(0);
  expect(out[0]![1]).toBe(2);
  expect(out[0]![2]).toBeCloseTo(0.2, 2);
  expect(out[1]![2]).toBe(1);
});

test('empty stroke', () => {
  expect(decodeInk(encodeInk([]))).toEqual([]);
});

test('rejects garbage', () => {
  expect(() => decodeInk('!!')).toThrow();
  expect(() => decodeInk('')).toThrow();
});

test('encode is stable after one round trip', () => {
  const pt = fc.tuple(
    fc.integer({ min: -100000, max: 100000 }),
    fc.integer({ min: -100000, max: 100000 }),
    fc.oneof(fc.constant(0.5), fc.double({ min: 0, max: 1, noNaN: true })),
  );
  fc.assert(
    fc.property(fc.array(pt, { maxLength: 50 }), (pts) => {
      const once = encodeInk(pts as [number, number, number][]);
      expect(encodeInk(decodeInk(once))).toBe(once);
    }),
  );
});
