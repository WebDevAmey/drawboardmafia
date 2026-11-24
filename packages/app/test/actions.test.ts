import { createStore, placeUnpositioned, type Board } from '@dbm/core';
import { parse, serialize } from '@dbm/format';
import { describe, expect, test } from 'vitest';
import { commitText, deleteElements, duplicate, pasteText, restack } from '../src/editor/actions';

const store = (body: string) => createStore(placeUnpositioned(parse(`board 1\n${body}`).board));
const text = (b: Board) => serialize(b).replace(/^board 1\n/, '');

describe('commitText', () => {
  test('first label renames an anonymous node and rewrites references', () => {
    const s = store('~aaaaaa: box @0,0\nb: box @300,0\n~cccccc: ~aaaaaa -> b\nf: frame @-20,-20 600x200 { ~aaaaaa b }\n');
    expect(commitText(s, '~aaaaaa', 'API Gateway')).toBe('api-gateway');
    expect(text(s.get())).toBe(
      'api-gateway: box "API Gateway" @0,0\nb: box @300,0\n~cccccc: api-gateway -> b\nf: frame @-20,-20 600x200 { api-gateway b }\n',
    );
  });

  test('default connector ids follow the rename', () => {
    const s = store('~aaaaaa: box @0,0\nb: box @300,0\nb-x: b -> ~aaaaaa\n');
    s.transact((d) => {
      d.remove('b-x');
      d.put({ id: 'b-~aaaaaa', type: 'arrow', from: { id: 'b' }, to: { id: '~aaaaaa' }, head: 'end', route: 'straight', stroke: 'ink', fill: 'none', width: 2, dash: 'solid' });
    });
    commitText(s, '~aaaaaa', 'db');
    expect(s.get().elements.map((e) => e.id)).toEqual(['db', 'b', 'b-db']);
  });

  test('named nodes keep their id; empty text elements are deleted', () => {
    const s = store('api: box @0,0\nt: text "x" @0,100\n');
    expect(commitText(s, 'api', 'Renamed')).toBe('api');
    expect(commitText(s, 't', '  ')).toBeUndefined();
    expect(text(s.get())).toBe('api: box "Renamed" @0,0\n');
  });

  test('text elements are resized to fit', () => {
    const s = store('t: text @0,0 20x20\n');
    commitText(s, 't', 'a much longer line of text');
    const el = s.get().elements[0]!;
    expect((el as { w: number }).w).toBeGreaterThan(100);
  });
});

test('deleting a node detaches connectors at their current position', () => {
  const s = store('a: box @0,0\nb: box @300,0\na -> b\n');
  deleteElements(s, ['b']);
  expect(text(s.get())).toBe('a: box @0,0\na-b: a -> (300,40)\n');
});

test('duplicate remaps internal references', () => {
  const s = store('~aaaaaa: box @0,0\n~bbbbbb: box @300,0\n~cccccc: ~aaaaaa -> ~bbbbbb\n');
  const ids = duplicate(s, ['~aaaaaa', '~bbbbbb', '~cccccc']);
  expect(ids).toHaveLength(3);
  const conn = s.get().elements.find((e) => e.id === ids[2]) as { from: { id: string }; to: { id: string } };
  expect([conn.from.id, conn.to.id]).toEqual([ids[0], ids[1]]);
});

describe('pasteText', () => {
  test('board text keeps named ids when free and suffixes on collision', () => {
    const s = store('api: box @0,0\n');
    const ids = pasteText(s, 'board 1\napi: box "x" @0,0\ndb: box @200,0\napi -> db\n', { x: 1000, y: 1000 });
    expect(ids).toEqual(['api-2', 'db', 'api-db']);
  });

  test('mermaid and plain text', () => {
    const s = store('');
    expect(pasteText(s, 'flowchart LR\nA --> B', { x: 0, y: 0 })).toHaveLength(3);
    const [t] = pasteText(s, 'hello world', { x: 0, y: 0 });
    expect(s.get().elements.find((e) => e.id === t)).toMatchObject({ type: 'text', text: 'hello world' });
  });
});

test('restack', () => {
  const s = store('a: box\nb: box\nc: box\n');
  restack(s, ['a'], 'front');
  expect(s.get().elements.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  restack(s, ['a'], 'backward');
  expect(s.get().elements.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  restack(s, ['c'], 'back');
  expect(s.get().elements.map((e) => e.id)).toEqual(['c', 'b', 'a']);
});
