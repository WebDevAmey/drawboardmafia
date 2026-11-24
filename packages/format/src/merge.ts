import { emptyBoard, type Board, type Element, type Id } from '@dbm/core';
import { parse, type Diagnostic } from './parse';
import { deepEqual } from './record';
import { serialize } from './serialize';

export interface Conflict {
  id: Id;
  prop: string;
  ours: unknown;
  theirs: unknown;
}

type Rec = Record<string, unknown>;

/** Three-way merge of a list treated as an ordered set. */
function mergeSet<T>(o: T[], a: T[], b: T[]): T[] {
  if (deepEqual(a, o)) return b;
  if (deepEqual(b, o)) return a;
  const inO = new Set(o.map((x) => JSON.stringify(x)));
  const inA = new Set(a.map((x) => JSON.stringify(x)));
  const inB = new Set(b.map((x) => JSON.stringify(x)));
  const keepA = a.filter((x) => inB.has(JSON.stringify(x)) || !inO.has(JSON.stringify(x)));
  const addB = b.filter((x) => !inA.has(JSON.stringify(x)) && !inO.has(JSON.stringify(x)));
  return [...keepA, ...addB];
}

/** Per-property three-way merge of two versions of one record. */
function mergeRecord(id: Id, o: Rec, a: Rec, b: Rec, conflicts: Conflict[], setKeys: string[] = []): Rec {
  const out: Rec = {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(a), ...Object.keys(b)])) {
    const [vo, va, vb] = [o[k], a[k], b[k]];
    let v: unknown;
    if (setKeys.includes(k) && Array.isArray(va) && Array.isArray(vb)) {
      v = mergeSet(Array.isArray(vo) ? vo : [], va, vb);
    } else if (deepEqual(va, vb) || deepEqual(vb, vo)) v = va;
    else if (deepEqual(va, vo)) v = vb;
    else {
      v = va;
      conflicts.push({ id, prop: k, ours: va, theirs: vb });
    }
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeElement(o: Element | undefined, a: Element | undefined, b: Element | undefined, conflicts: Conflict[]): Element | undefined {
  const id = (a ?? b ?? o)!.id;
  if (!a && !b) return undefined;
  if (!a || !b) {
    const kept = (a ?? b)!;
    if (!o) return kept; // added on one side
    if (deepEqual(kept, o)) return undefined; // deleted on one side, untouched on the other
    conflicts.push({ id, prop: 'deleted', ours: !a, theirs: !b });
    return kept; // deleted vs edited: keep the edit
  }
  if (a.type !== b.type) {
    // One side changed the type: it wins whole. Report if the other side's edits are lost.
    const winner = o && a.type === o.type ? b : a;
    const loser = winner === a ? b : a;
    if (!o || !deepEqual(loser, o)) conflicts.push({ id, prop: 'type', ours: a.type, theirs: b.type });
    return winner;
  }
  const base = o && o.type === a.type ? (o as unknown as Rec) : {};
  return mergeRecord(id, base, a as unknown as Rec, b as unknown as Rec, conflicts, ['members']) as unknown as Element;
}

/** True when the elements common to `x` and `o` appear in the same relative order. */
function sameRelativeOrder(o: Id[], x: Id[]): boolean {
  const inX = new Set(x);
  const inO = new Set(o);
  return deepEqual(o.filter((id) => inX.has(id)), x.filter((id) => inO.has(id)));
}

function mergeOrder(o: Id[], a: Id[], b: Id[], kept: Set<Id>): Id[] {
  // If ours did not reorder anything, theirs' order (which may include a reorder) is primary.
  const [primary, secondary] = sameRelativeOrder(o, a) ? [b, a] : [a, b];
  const result = primary.filter((id) => kept.has(id));
  const placed = new Set(result);
  let prev: Id | undefined;
  for (const id of secondary) {
    if (!kept.has(id)) continue;
    if (!placed.has(id)) {
      const at = prev === undefined ? 0 : result.indexOf(prev) + 1;
      result.splice(at, 0, id);
      placed.add(id);
    }
    prev = id;
  }
  return result;
}

export function mergeBoards(o: Board, a: Board, b: Board): { board: Board; conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];
  const byId = (bd: Board) => new Map(bd.elements.map((e) => [e.id, e]));
  const [mo, ma, mb] = [byId(o), byId(a), byId(b)];
  const merged = new Map<Id, Element>();
  for (const id of new Set([...mo.keys(), ...ma.keys(), ...mb.keys()])) {
    const el = mergeElement(mo.get(id), ma.get(id), mb.get(id), conflicts);
    if (el) merged.set(id, el);
  }
  const ids = (bd: Board) => bd.elements.map((e) => e.id);
  const order = mergeOrder(ids(o), ids(a), ids(b), new Set(merged.keys()));
  const header = (bd: Board): Rec => ({ sketch: bd.sketch, bg: bd.bg, grid: bd.grid, trailingComments: bd.trailingComments });
  const h = mergeRecord('(board)', header(o), header(a), header(b), conflicts);
  const board: Board = {
    version: 1,
    sketch: h.sketch as Board['sketch'],
    elements: order.map((id) => merged.get(id)!),
    trailingComments: (h.trailingComments as string[]) ?? [],
  };
  if (h.bg !== undefined) board.bg = h.bg as Board['bg'];
  if (h.grid !== undefined) board.grid = h.grid as Board['grid'];
  return { board, conflicts };
}

export interface TextMergeResult {
  text: string;
  conflicts: Conflict[];
  diagnostics: (Diagnostic & { version: 'base' | 'ours' | 'theirs' })[];
}

/** Merges three versions of a .board file. An empty base means "added on both sides". */
export function mergeText(o: string, a: string, b: string): TextMergeResult {
  const diagnostics: TextMergeResult['diagnostics'] = [];
  const load = (text: string, version: 'base' | 'ours' | 'theirs'): Board => {
    if (text.trim() === '') return emptyBoard();
    const r = parse(text);
    for (const d of r.diagnostics) if (d.severity === 'error') diagnostics.push({ ...d, version });
    return r.board;
  };
  const { board, conflicts } = mergeBoards(load(o, 'base'), load(a, 'ours'), load(b, 'theirs'));
  return { text: serialize(board), conflicts, diagnostics };
}
