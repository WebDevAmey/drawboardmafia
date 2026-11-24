import {
  STYLE_DEFAULTS, defaultSize, emptyBoard, layeredLayout, type Board, type Connector, type FrameEl,
  type Id, type ShapeEl, type ShapeType,
} from '@dbm/core';
import type { Diagnostic } from '../parse';
import { IdAllocator } from './ids';

const SHAPES: [open: string, close: string, type: ShapeType][] = [
  ['[(', ')]', 'cylinder'],
  ['((', '))', 'ellipse'],
  ['([', '])', 'box'],
  ['[[', ']]', 'box'],
  ['[', ']', 'box'],
  ['(', ')', 'box'],
  ['{', '}', 'diamond'],
  ['>', ']', 'box'],
];

const OP_RE = /^(<)?(-{2,}>|-{3,}|-\.+->|-\.+-|={2,}>|={3,}|--[xo])(?:\|([^|]*)\|)?/;
const LABELED_OP_RE = /^(<)?(--|-\.|==)\s+(.+?)\s+(-{2,}>|-{3,}|\.+->|\.+-|={2,}>|={3,})/;
const ID_RE = /^[A-Za-z0-9_]+/;
const IGNORED = /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/;

interface Edge { from: string; to: string; label?: string; head: Connector['head']; dash: Connector['dash']; width: Connector['width'] }

export function fromMermaid(src: string): { board: Board; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const board = emptyBoard();
  const lines = src.split(/\r?\n/);
  const ids = new IdAllocator();
  const nodes = new Map<string, ShapeEl>(); // mermaid id → element
  const edges: Edge[] = [];
  const frames: { el: FrameEl; members: Set<Id> }[] = [];
  const frameStack: { el: FrameEl; members: Set<Id> }[] = [];
  let dir: 'LR' | 'TB' | 'RL' | 'BT' | undefined;

  const touch = (mid: string, text?: string, type?: ShapeType): ShapeEl => {
    let n = nodes.get(mid);
    if (!n) {
      const label = text ?? mid;
      const size = defaultSize('box');
      n = {
        id: ids.slug(mid), type: type ?? 'box', label, w: Math.max(size.w, Math.min(400, [...label].length * 10 + 40)), h: size.h,
        rot: 0, ...STYLE_DEFAULTS, fill: 'none',
      };
      if (n.type === 'diamond') n.h = defaultSize('diamond').h;
      if (n.type === 'cylinder') n.h = defaultSize('cylinder').h;
      nodes.set(mid, n);
    } else if (text !== undefined) {
      n.label = text;
      if (type) n.type = type;
    }
    frameStack[frameStack.length - 1]?.members.add(n.id);
    return n;
  };

  /** Parses `ID[shape text]` at s[i]. Returns the new index or -1. */
  const readNode = (s: string, i: number): { mid: string; text?: string; type?: ShapeType; end: number } | null => {
    const m = ID_RE.exec(s.slice(i));
    if (!m) return null;
    let end = i + m[0].length;
    for (const [open, close, type] of SHAPES) {
      if (!s.startsWith(open, end)) continue;
      let at = end + open.length;
      let text: string;
      if (s[at] === '"') {
        const q = s.indexOf('"', at + 1);
        if (q < 0) return null;
        text = s.slice(at + 1, q);
        at = q + 1;
        if (!s.startsWith(close, at)) return null;
      } else {
        const c = s.indexOf(close, at);
        if (c < 0) return null;
        text = s.slice(at, c).trim();
        at = c;
      }
      return { mid: m[0], text, type, end: at + close.length };
    }
    return { mid: m[0], end };
  };

  const statement = (s: string, line: number) => {
    if (IGNORED.test(s)) {
      diagnostics.push({ line, severity: 'warning', message: `ignored unsupported statement '${s.split(/\s/)[0]}'` });
      return;
    }
    if (s.includes('&')) {
      diagnostics.push({ line, severity: 'warning', message: "ignored: '&' node groups are not supported" });
      return;
    }
    const sub = /^subgraph\s+([A-Za-z0-9_]+)?\s*(?:\[\s*"?([^"\]]*)"?\s*\])?\s*(.*)$/.exec(s);
    if (sub) {
      const name = (sub[2] ?? sub[3] ?? sub[1] ?? '').trim() || (sub[1] ?? 'group');
      const el: FrameEl = { id: ids.slug(sub[1] ?? name), type: 'frame', name, members: [], ...defaultSize('frame'), rot: 0, ...STYLE_DEFAULTS };
      const f = { el, members: new Set<Id>() };
      frames.push(f);
      frameStack.push(f);
      return;
    }
    if (s === 'end') {
      if (!frameStack.pop()) diagnostics.push({ line, severity: 'warning', message: "unmatched 'end'" });
      return;
    }
    let i = 0;
    const first = readNode(s, i);
    if (!first) {
      diagnostics.push({ line, severity: 'warning', message: `could not parse '${s}'` });
      return;
    }
    let prev = touch(first.mid, first.text, first.type);
    i = first.end;
    while (i < s.length) {
      while (s[i] === ' ') i++;
      if (i >= s.length) break;
      const rest = s.slice(i);
      let m = OP_RE.exec(rest);
      let op: string;
      let label: string | undefined;
      let both: boolean;
      if (m) {
        both = !!m[1];
        op = m[2]!;
        label = m[3]?.trim() || undefined;
      } else if ((m = LABELED_OP_RE.exec(rest))) {
        both = !!m[1];
        op = m[2]! + m[4]!;
        label = m[3]!.trim();
      } else {
        diagnostics.push({ line, severity: 'warning', message: `could not parse '${rest}'` });
        return;
      }
      i += m[0].length;
      while (s[i] === ' ') i++;
      const next = readNode(s, i);
      if (!next) {
        diagnostics.push({ line, severity: 'warning', message: 'edge is missing its target' });
        return;
      }
      const target = touch(next.mid, next.text, next.type);
      i = next.end;
      const arrow = op.endsWith('>');
      edges.push({
        from: prev.id, to: target.id, label,
        head: both && arrow ? 'both' : arrow ? 'end' : 'none',
        dash: op.includes('.') ? 'dotted' : 'solid',
        width: op.includes('=') ? 4 : 2,
      });
      prev = target;
    }
  };

  let started = false;
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    for (const part of raw.split(';')) {
      const s = part.trim();
      if (!s || s.startsWith('%%')) continue;
      if (!started) {
        started = true;
        const h = /^(flowchart|graph)(?:\s+(LR|RL|TD|TB|BT))?\s*$/.exec(s);
        if (!h) {
          diagnostics.push({ line, severity: 'error', message: 'only Mermaid flowcharts are supported (expected `flowchart LR` or `graph TD`)' });
          return;
        }
        const d = h[2] ?? 'TB';
        dir = d === 'TD' ? 'TB' : (d as typeof dir);
        continue;
      }
      if (dir) statement(s, line);
    }
  });
  if (!dir) {
    if (!started) diagnostics.push({ line: 1, severity: 'error', message: 'empty input' });
    return { board, diagnostics };
  }

  const connectors: Connector[] = [];
  for (const e of edges) {
    const base = `${e.from}-${e.to}`;
    const id = ids.has(base) ? ids.slug(base) : ids.take(base);
    const c: Connector = { id, type: 'arrow', from: { id: e.from }, to: { id: e.to }, head: e.head, route: 'straight', ...STYLE_DEFAULTS, dash: e.dash, width: e.width };
    if (e.label) c.label = e.label;
    connectors.push(c);
  }
  for (const f of frames) f.el.members = [...f.members];
  board.elements = [...frames.map((f) => f.el), ...nodes.values(), ...connectors];
  return { board: layeredLayout(board, dir), diagnostics };
}
