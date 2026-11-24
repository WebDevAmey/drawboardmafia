import { expect, test } from 'vitest';
import fc from 'fast-check';
import { mergeBoards, mergeText } from '../src/merge';
import { parse } from '../src/parse';
import { serialize } from '../src/serialize';
import { boardArb } from './arbitrary';

const B = (body: string) => `board 1\n${body}`;
const m = (o: string, a: string, b: string) => mergeText(B(o), B(a), B(b));

const BASE = 'api: box "API" @0,0\ndb: box "DB" @300,0\napi -> db\n';

test('edits to different elements combine', () => {
  const r = m(BASE, BASE.replace('@0,0', '@40,0'), BASE.replace('"DB"', '"Postgres"'));
  expect(r.text).toBe(B('api: box "API" @40,0\ndb: box "Postgres" @300,0\napi -> db\n'));
  expect(r.conflicts).toEqual([]);
});

test('edits to different properties of the same element combine', () => {
  const r = m(BASE, BASE.replace('@0,0', '@40,0'), BASE.replace('"API"', '"Gateway"'));
  expect(r.text).toContain('api: box "Gateway" @40,0\n');
  expect(r.conflicts).toEqual([]);
});

test('same property changed both ways: ours wins, conflict recorded', () => {
  const r = m(BASE, BASE.replace('"API"', '"A"'), BASE.replace('"API"', '"B"'));
  expect(r.text).toContain('api: box "A"');
  expect(r.conflicts).toEqual([{ id: 'api', prop: 'label', ours: 'A', theirs: 'B' }]);
});

test('same change on both sides is not a conflict', () => {
  const r = m(BASE, BASE.replace('"API"', '"A"'), BASE.replace('"API"', '"A"'));
  expect(r.conflicts).toEqual([]);
});

test('deleted vs unchanged deletes', () => {
  const r = m(BASE, BASE.replace('api -> db\n', ''), BASE);
  expect(r.text).toBe(B('api: box "API" @0,0\ndb: box "DB" @300,0\n'));
});

test('deleted vs edited keeps the edit and reports it', () => {
  const r = m(BASE, BASE.replace('db: box "DB" @300,0\n', ''), BASE.replace('"DB"', '"PG"'));
  expect(r.text).toContain('db: box "PG"');
  expect(r.conflicts).toEqual([{ id: 'db', prop: 'deleted', ours: true, theirs: false }]);
});

test('additions on both sides are kept in order', () => {
  const r = m(BASE, BASE + 'q: box "Q"\n', BASE.replace('api -> db\n', 'cache: box "C"\napi -> db\n'));
  expect(parse(r.text).board.elements.map((e) => e.id)).toEqual(['api', 'db', 'cache', 'api-db', 'q']);
});

test('frame members merge as sets', () => {
  const o = 'a: box\nb: box\nc: box\nf: frame { a }\n';
  const r = m(o, o.replace('{ a }', '{ a b }'), o.replace('{ a }', '{ a c }'));
  expect(r.text).toContain('f: frame { a b c }');
  expect(r.conflicts).toEqual([]);
});

test('type change vs edit keeps one whole element', () => {
  const r = m('a: box "x"\n', 'a: note "y"\n', 'a: box "z"\n');
  expect(r.text).toBe(B('a: note "y"\n'));
  expect(r.conflicts[0]).toMatchObject({ id: 'a', prop: 'type' });
});

test('header attributes merge', () => {
  const r = mergeText('board 1\n', 'board 1 sketch=1\n', 'board 1 grid=dots\n');
  expect(r.text).toBe('board 1 sketch=1 grid=dots\n');
});

test('empty base (file added on both branches)', () => {
  const r = mergeText('', 'board 1\na: box\n', 'board 1\nb: box\n');
  expect(r.text).toBe('board 1\na: box\nb: box\n');
  expect(r.diagnostics).toEqual([]);
});

test('merge identities (property)', () => {
  fc.assert(
    fc.property(boardArb, boardArb, (o, a) => {
      const so = serialize(o);
      const sa = serialize(a);
      expect(serialize(mergeBoards(o, a, o).board)).toBe(sa);
      expect(serialize(mergeBoards(o, o, a).board)).toBe(sa);
      expect(serialize(mergeBoards(o, a, a).board)).toBe(sa);
      expect(mergeBoards(o, o, o).conflicts).toEqual([]);
      void so;
    }),
    { numRuns: 200 },
  );
}, 30_000);
