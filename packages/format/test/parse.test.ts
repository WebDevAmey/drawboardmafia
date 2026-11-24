import { describe, expect, test } from 'vitest';
import { parse } from '../src/parse';

const errors = (text: string) => parse(text).diagnostics.filter((d) => d.severity === 'error');

const EXAMPLE = `board 1 sketch=1 grid=dots
// Checkout flow
api: box "API Gateway" @120,80 240x80 fill=blue
db: cylinder "Postgres" @520,80
cache: box "Redis"
api -> db "reads" route=elbow
api-cache: api -- cache dash=dotted
f1: frame "Checkout" @80,40 700x300 { api db cache }
~a8f3kq: ink @300,400 pts=AAIAAAoJ
// trailing
`;

describe('parse', () => {
  test('example board', () => {
    const { board, diagnostics } = parse(EXAMPLE);
    expect(diagnostics).toEqual([]);
    expect(board.sketch).toBe(1);
    expect(board.grid).toBe('dots');
    expect(board.elements.map((e) => e.id)).toEqual(['api', 'db', 'cache', 'api-db', 'api-cache', 'f1', '~a8f3kq']);
    expect(board.elements[0]).toEqual({
      id: 'api', type: 'box', label: 'API Gateway', x: 120, y: 80, w: 240, h: 80, rot: 0,
      stroke: 'ink', fill: 'blue', width: 2, dash: 'solid', comments: ['Checkout flow'],
    });
    expect(board.elements[1]).toMatchObject({ type: 'cylinder', w: 120, h: 100 });
    expect(board.elements[2]).toMatchObject({ x: undefined, y: undefined });
    expect(board.elements[3]).toEqual({
      id: 'api-db', type: 'arrow', from: { id: 'api' }, to: { id: 'db' }, head: 'end', route: 'elbow',
      label: 'reads', stroke: 'ink', fill: 'none', width: 2, dash: 'solid',
    });
    expect(board.elements[4]).toMatchObject({ head: 'none', dash: 'dotted' });
    expect(board.elements[5]).toMatchObject({ type: 'frame', name: 'Checkout', members: ['api', 'db', 'cache'] });
    expect(board.elements[6]).toMatchObject({ type: 'ink', x: 300, y: 400, pts: [[0, 0, 0.5], [5, -5, 0.5]] });
    expect(board.trailingComments).toEqual(['trailing']);
  });

  test('text and note bodies, free ends, two heads', () => {
    const { board, diagnostics } = parse(
      'board 1\nt: text "line1\\nline2" @0,0 align=c size=3\nx: (10,20) <-> t via="5,5;6,6"\nn: note "hi"\n',
    );
    expect(diagnostics).toEqual([]);
    expect(board.elements[0]).toMatchObject({ type: 'text', text: 'line1\nline2', align: 'c', size: 3 });
    expect(board.elements[1]).toMatchObject({ from: { x: 10, y: 20 }, to: { id: 't' }, head: 'both', via: [[5, 5], [6, 6]] });
    expect(board.elements[2]).toMatchObject({ type: 'note', fill: 'yellow', w: 200, h: 200 });
  });

  test('missing header is an error but content still loads', () => {
    const r = parse('a: box\n');
    expect(r.diagnostics[0]).toMatchObject({ line: 1, severity: 'error' });
    expect(r.board.elements).toHaveLength(1);
  });

  test('bad lines are skipped, others load', () => {
    const r = parse('board 1\na: box\nb: box fill=purple\nc: blob\nd: box "x\ne: box\n');
    expect(r.board.elements.map((e) => e.id)).toEqual(['a', 'e']);
    expect(errors('board 1\na: box\nb: box fill=purple\nc: blob\nd: box "x\ne: box\n').map((d) => d.line)).toEqual([3, 4, 5]);
  });

  test('duplicate ids: first wins', () => {
    const r = parse('board 1\na: box\na: ellipse\n');
    expect(r.board.elements).toHaveLength(1);
    expect(r.board.elements[0]!.type).toBe('box');
    expect(errors('board 1\na: box\na: ellipse\n')[0]!.line).toBe(3);
  });

  test('connector default id collision needs explicit id', () => {
    const r = parse('board 1\na: box\nb: box\na -> b\na -> b\n');
    expect(r.board.elements.map((e) => e.id)).toEqual(['a', 'b', 'a-b']);
    expect(r.diagnostics[0]).toMatchObject({ line: 5, severity: 'error' });
  });

  test('id-less connector with a free end is an error', () => {
    expect(errors('board 1\n(0,0) -> (5,5)\n')).toHaveLength(1);
  });

  test('dangling references are warnings and elements are kept', () => {
    const r = parse('board 1\na -> ghost\nf: frame { nope }\n');
    expect(r.board.elements).toHaveLength(2);
    expect(r.diagnostics.map((d) => d.severity)).toEqual(['warning', 'warning', 'warning']);
  });

  test('unknown attribute is an error', () => {
    expect(errors('board 1\na: box colour=red\n')).toHaveLength(1);
  });

  test('lineOf maps ids to 1-based lines', () => {
    expect(parse('board 1\n\na: box\n').lineOf.get('a')).toBe(3);
  });

  test('CRLF input', () => {
    expect(parse('board 1\r\na: box "x"\r\n').diagnostics).toEqual([]);
  });
});
