import { expect, test } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { serialize } from '../src/serialize';
import { boardArb } from './arbitrary';

const canon = (text: string) => serialize(parse(text).board);

test('omits defaults, orders attributes canonically', () => {
  expect(canon('board 1\napi: box "API" @120,80 160x80 group=g dash=solid fill=blue width=2\n')).toBe(
    'board 1\napi: box "API" @120,80 fill=blue group=g\n',
  );
});

test('note keeps default yellow fill implicit', () => {
  expect(canon('board 1\nn: note "hi" fill=yellow\n')).toBe('board 1\nn: note "hi"\n');
});

test('connector ids omitted only when equal to from-to', () => {
  expect(canon('board 1\na: box\nb: box\na-b: a -> b\nc: b <-> a "x" route=curve\nd: (0,0) -- b\n')).toBe(
    'board 1\na: box\nb: box\na -> b\nc: b <-> a "x" route=curve\nd: (0,0) -- b\n',
  );
});

test('comments, header, frames, escaping', () => {
  const src = 'board 1 sketch=2 bg=#101010 grid=lines\n// hello\n// world\nf: frame "F \\"q\\"\\nx" @0,0 { a b }\nt: text "" @1,1\n// end\n';
  expect(canon(src)).toBe(
    'board 1 sketch=2 bg=#101010 grid=lines\n// hello\n// world\nf: frame "F \\"q\\"\\nx" @0,0 { a b }\nt: text @1,1\n// end\n',
  );
});

test('rotation keeps one decimal', () => {
  expect(canon('board 1\na: box rot=12.5\nb: box rot=-0.0\n')).toBe('board 1\na: box rot=12.5\nb: box\n');
});

test('round trip is lossless and stable (property)', () => {
  fc.assert(
    fc.property(boardArb, (board) => {
      const once = serialize(board);
      const parsed = parse(once);
      expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(serialize(parsed.board)).toBe(once);
    }),
    { numRuns: 300 },
  );
}, 30_000);
