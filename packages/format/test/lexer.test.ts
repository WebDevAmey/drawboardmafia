import { expect, test } from 'vitest';
import { lexLine } from '../src/lexer';

const kinds = (src: string) => lexLine(src).tokens.map((t) => t.kind);

test('node line', () => {
  const { tokens, error } = lexLine('api: box "API \\"v2\\"" @-120,80 240x80 fill=blue');
  expect(error).toBeUndefined();
  expect(tokens.map((t) => t.kind)).toEqual(['ident', 'colon', 'ident', 'string', 'pos', 'size', 'attr']);
  expect(tokens[3]!.value).toBe('API "v2"');
  expect(tokens[4]!.value).toEqual([-120, 80]);
  expect(tokens[5]!.value).toEqual([240, 80]);
  expect(tokens[6]!.value).toEqual(['fill', 'blue']);
});

test('string escapes', () => {
  expect(lexLine('"a\\nb\\\\c"').tokens[0]!.value).toBe('a\nb\\c');
});

test('unterminated string reports column', () => {
  const r = lexLine('a: box "oops');
  expect(r.error).toEqual({ col: 7, message: 'unterminated string' });
});

test('connector ops and free ends', () => {
  expect(kinds('a -> b')).toEqual(['ident', 'op', 'ident']);
  expect(kinds('a <-> b')).toEqual(['ident', 'op', 'ident']);
  expect(kinds('a -- b')).toEqual(['ident', 'op', 'ident']);
  expect(kinds('a->b')).toEqual(['ident', 'op', 'ident']);
  const free = lexLine('(10,-20) -> api-2');
  expect(free.tokens.map((t) => t.kind)).toEqual(['point', 'op', 'ident']);
  expect(free.tokens[0]!.value).toEqual([10, -20]);
  expect(free.tokens[2]!.text).toBe('api-2');
});

test('frame members and bare attr values', () => {
  expect(kinds('f1: frame "F" { a b }')).toEqual(['ident', 'colon', 'ident', 'string', 'lbrace', 'ident', 'ident', 'rbrace']);
  const t = lexLine('~a8f3kq: ink pts=Ab3_9- rot=12.5').tokens;
  expect(t[0]!.text).toBe('~a8f3kq');
  expect(t[3]!.value).toEqual(['pts', 'Ab3_9-']);
  expect(t[4]!.value).toEqual(['rot', '12.5']);
});

test('quoted attr value', () => {
  expect(lexLine('x=" a b "').tokens[0]!.value).toEqual(['x', ' a b ']);
});

test('unknown character', () => {
  expect(lexLine('a: box $').error).toEqual({ col: 7, message: "unexpected '$'" });
});
