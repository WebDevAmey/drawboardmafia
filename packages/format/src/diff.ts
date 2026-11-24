import { isBoundEnd, type Board, type Element, type End, type Id } from '@dbm/core';
import { deepEqual } from './record';

export type Change =
  | { kind: 'added' | 'removed'; el: Element }
  | { kind: 'changed'; id: Id; before: Element; after: Element; props: string[] }
  | { kind: 'reordered' };

export function diffBoards(a: Board, b: Board): Change[] {
  const changes: Change[] = [];
  const ma = new Map(a.elements.map((e) => [e.id, e]));
  const mb = new Map(b.elements.map((e) => [e.id, e]));
  for (const el of a.elements) if (!mb.has(el.id)) changes.push({ kind: 'removed', el });
  for (const el of b.elements) {
    const prev = ma.get(el.id);
    if (!prev) {
      changes.push({ kind: 'added', el });
      continue;
    }
    const pa = prev as unknown as Record<string, unknown>;
    const pb = el as unknown as Record<string, unknown>;
    const props = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].filter((k) => !deepEqual(pa[k], pb[k]));
    if (props.length) changes.push({ kind: 'changed', id: el.id, before: prev, after: el, props });
  }
  const common = (x: Board, other: Map<Id, Element>) => x.elements.map((e) => e.id).filter((id) => other.has(id));
  if (!deepEqual(common(a, mb), common(b, ma))) changes.push({ kind: 'reordered' });
  return changes;
}

const MAX = 32;
function show(v: unknown): string {
  let s: string;
  if (v === undefined) s = 'unset';
  else if (typeof v === 'string') s = JSON.stringify(v);
  else if (typeof v === 'object' && v !== null && ('id' in v || 'x' in v)) s = endText(v as End);
  else s = JSON.stringify(v);
  return s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s;
}
const endText = (e: End) => (isBoundEnd(e) ? e.id : `(${e.x},${e.y})`);
const bare = (v: unknown) => (typeof v === 'string' ? v : show(v));
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const TEXT_PROPS = ['label', 'text', 'name'];

function describe(el: Element): string {
  const r = el as unknown as Record<string, unknown>;
  const t = TEXT_PROPS.map((k) => r[k]).find((v) => typeof v === 'string' && v !== '');
  return t === undefined ? el.type : `${el.type} ${show(t)}`;
}

export function formatChanges(changes: Change[]): string[] {
  return changes.map((c) => {
    if (c.kind === 'reordered') return 'paint order changed';
    if (c.kind !== 'changed') return `${c.kind} ${c.el.id} (${describe(c.el)})`;
    const before = c.before as unknown as Record<string, unknown>;
    const after = c.after as unknown as Record<string, unknown>;
    const parts: string[] = [];
    const rest = c.props
      .filter((p) => p !== 'x' && p !== 'y')
      .sort((p, q) => Number(TEXT_PROPS.includes(q)) - Number(TEXT_PROPS.includes(p)));
    if (c.props.includes('x') || c.props.includes('y')) {
      const [bx, by, ax, ay] = [before.x, before.y, after.x, after.y] as (number | undefined)[];
      if (ax === undefined || ay === undefined) parts.push('unplaced');
      else if (bx === undefined || by === undefined) parts.push(`placed at ${ax},${ay}`);
      else parts.push(`moved (${signed(ax - bx)},${signed(ay - by)})`);
    }
    for (const p of rest) {
      if (TEXT_PROPS.includes(p)) parts.push(`relabelled ${show(before[p])} → ${show(after[p])}`);
      else parts.push(`${p} ${bare(before[p])} → ${bare(after[p])}`);
    }
    return `${c.id}: ${parts.join('; ')}`;
  });
}
