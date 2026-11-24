import { describe, expect, test } from 'vitest';
import { fromExcalidraw } from '../src/import/excalidraw';
import { fromMermaid } from '../src/import/mermaid';
import { parse } from '../src/parse';
import { serialize } from '../src/serialize';
import type { Board, Connector, NodeEl } from '@dbm/core';

const reparses = (b: Board) => {
  const r = parse(serialize(b));
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(serialize(r.board)).toBe(serialize(b));
};
const get = <T>(b: Board, id: string) => b.elements.find((e) => e.id === id) as T;

describe('fromMermaid', () => {
  test('shapes, labels, chains, edge styles', () => {
    const { board, diagnostics } = fromMermaid(`flowchart LR
  %% comment
  A[Client] --> B(API) -->|reads| DB[(Postgres)]
  B -.-> C{Cache?}
  B ==> Q((Queue))
  C --- A
  B -- writes --> DB
`);
    expect(diagnostics).toEqual([]);
    expect(board.elements.filter((e) => e.type !== 'arrow').map((e) => [e.id, e.type])).toEqual([
      ['a', 'box'], ['b', 'box'], ['db', 'cylinder'], ['c', 'diamond'], ['q', 'ellipse'],
    ]);
    expect(get<NodeEl & { label: string }>(board, 'db').label).toBe('Postgres');
    expect(get<Connector>(board, 'b-db')).toMatchObject({ label: 'reads', head: 'end' });
    expect(get<Connector>(board, 'b-c')).toMatchObject({ dash: 'dotted' });
    expect(get<Connector>(board, 'b-q')).toMatchObject({ width: 4 });
    expect(get<Connector>(board, 'c-a')).toMatchObject({ head: 'none' });
    expect(get<Connector>(board, 'b-db-2')).toMatchObject({ label: 'writes' });
    expect(get<NodeEl>(board, 'a').x!).toBeLessThan(get<NodeEl>(board, 'b').x!);
    reparses(board);
  });

  test('graph TD, bare ids, quoted text, semicolons, subgraphs', () => {
    const { board } = fromMermaid('graph TD\nsubgraph backend [Back end]\n  x["Hello [world]"] --> y;\nend\ny --> z');
    expect(get<NodeEl & { label: string }>(board, 'x').label).toBe('Hello [world]');
    expect(get<NodeEl & { label: string }>(board, 'y').label).toBe('y');
    expect(get<NodeEl>(board, 'x').y!).toBeLessThan(get<NodeEl>(board, 'y').y!);
    expect(get<{ type: string; name: string; members: string[] }>(board, 'backend')).toMatchObject({ type: 'frame', name: 'Back end', members: ['x', 'y'] });
    reparses(board);
  });

  test('ids are slugified without collisions', () => {
    const { board } = fromMermaid('flowchart LR\nMy_Node --> my_node\n1st --> My_Node');
    expect(board.elements.filter((e) => e.type !== 'arrow').map((e) => e.id)).toEqual(['my_node', 'my_node-2', 'n1st']);
    reparses(board);
  });

  test('unsupported statements warn', () => {
    const { diagnostics } = fromMermaid('flowchart LR\nA --> B\nclassDef red fill:#f00\nA & B --> C\n');
    expect(diagnostics.map((d) => d.line)).toEqual([3, 4]);
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  test('non-flowchart is an error', () => {
    expect(fromMermaid('sequenceDiagram\nA->>B: hi').diagnostics[0]).toMatchObject({ severity: 'error' });
  });
});

const ex = (elements: unknown[]) => ({ type: 'excalidraw', version: 2, elements });
const base = { angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, groupIds: [], frameId: null, isDeleted: false };

describe('fromExcalidraw', () => {
  test('maps shapes, bound text, arrows, freedraw, frames', () => {
    const { board, diagnostics } = fromExcalidraw(ex([
      { ...base, id: 'frameA', type: 'frame', x: -50, y: -50, width: 600, height: 300, name: 'Sys' },
      { ...base, id: 'r1', type: 'rectangle', x: 0, y: 0, width: 200, height: 100, backgroundColor: '#ffc9c9', frameId: 'frameA', angle: Math.PI / 2 },
      { ...base, id: 't1', type: 'text', x: 10, y: 10, width: 50, height: 20, text: 'API', originalText: 'API', containerId: 'r1', fontSize: 20, fontFamily: 1, textAlign: 'center' },
      { ...base, id: 'e1', type: 'ellipse', x: 400, y: 0, width: 100, height: 100, strokeColor: '#e03131', strokeStyle: 'dashed', roughness: 0 },
      { ...base, id: 'a1', type: 'arrow', x: 200, y: 50, width: 200, height: 0, points: [[0, 0], [100, 20], [200, 0]], startBinding: { elementId: 'r1' }, endBinding: { elementId: 'e1' }, startArrowhead: null, endArrowhead: 'arrow' },
      { ...base, id: 'l1', type: 'line', x: 0, y: 300, width: 50, height: 0, points: [[0, 0], [50, 0]], startArrowhead: null, endArrowhead: null },
      { ...base, id: 'f1', type: 'freedraw', x: 600, y: 600, width: 10, height: 10, points: [[0, 0], [5, 5], [10, 10]], pressures: [0.2, 0.5, 0.9] },
      { ...base, id: 'txt', type: 'text', x: 0, y: 500, width: 100, height: 30, text: 'free text', fontSize: 28, fontFamily: 3, textAlign: 'left' },
      { ...base, id: 'gone', type: 'rectangle', x: 0, y: 0, width: 1, height: 1, isDeleted: true },
      { ...base, id: 'img', type: 'image', x: 0, y: 0, width: 1, height: 1 },
    ]));
    expect(diagnostics.map((d) => d.severity)).toEqual(['warning']);
    const types = board.elements.map((e) => e.type);
    expect(types).toEqual(['frame', 'box', 'ellipse', 'arrow', 'arrow', 'ink', 'text']);
    expect(board.sketch).toBe(1);
    const [frame, box, ellipse, arrow, line, ink, text] = board.elements as any[];
    expect(frame).toMatchObject({ name: 'Sys', members: [box.id] });
    expect(box).toMatchObject({ label: 'API', fill: 'red', rot: 90, font: 'hand', x: 0, y: 0, w: 200, h: 100 });
    expect(box.id).toMatch(/^~[a-z0-9]{6}$/);
    expect(ellipse).toMatchObject({ stroke: 'red', dash: 'dashed', sketch: 0 });
    expect(arrow).toMatchObject({ from: { id: box.id }, to: { id: ellipse.id }, head: 'end', via: [[300, 70]] });
    expect(line).toMatchObject({ from: { x: 0, y: 300 }, to: { x: 50, y: 300 }, head: 'none' });
    expect(ink.pts[2]).toEqual([10, 10, 0.9]);
    expect(text).toMatchObject({ text: 'free text', font: 'mono', size: 3 });
    reparses(board);
  });

  test('rejects non-excalidraw input', () => {
    expect(fromExcalidraw({ nope: true }).diagnostics[0]).toMatchObject({ severity: 'error' });
    expect(fromExcalidraw(null).board.elements).toEqual([]);
  });

  test('skips malformed elements with a warning', () => {
    const { board, diagnostics } = fromExcalidraw(ex([{ id: 'x', type: 'rectangle', x: 'NaN' }, 42]));
    expect(board.elements).toEqual([]);
    expect(diagnostics).toHaveLength(2);
  });
});
