import { expect, test } from 'vitest';
import { diffBoards, formatChanges } from '../src/diff';
import { parse } from '../src/parse';

const d = (a: string, b: string) => formatChanges(diffBoards(parse(`board 1\n${a}`).board, parse(`board 1\n${b}`).board));

test('no changes', () => {
  expect(d('a: box\n', 'a: box\n')).toEqual([]);
});

test('add and remove', () => {
  expect(d('a: box\n', 'b: ellipse "B"\n')).toEqual(['removed a (box)', 'added b (ellipse "B")']);
});

test('move, relabel and restyle', () => {
  expect(d('api: box "A" @0,0\n', 'api: box "Gateway" @40,-10 fill=blue\n')).toEqual([
    'api: moved (+40,-10); relabelled "A" → "Gateway"; fill none → blue',
  ]);
});

test('placing an unplaced node', () => {
  expect(d('a: box\n', 'a: box @5,5\n')).toEqual(['a: placed at 5,5']);
});

test('connector changes', () => {
  expect(d('a: box\nb: box\nc: box\na -> b\n', 'a: box\nb: box\nc: box\na-b: a -> c route=elbow\n')).toEqual([
    'a-b: to b → c; route straight → elbow',
  ]);
});

test('paint order change', () => {
  expect(d('a: box\nb: box\n', 'b: box\na: box\n')).toEqual(['paint order changed']);
});

test('long values are truncated', () => {
  const out = d('t: text "short"\n', `t: text "${'x'.repeat(80)}"\n`);
  expect(out[0]!.length).toBeLessThan(90);
});
