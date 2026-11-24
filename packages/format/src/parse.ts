import {
  NODE_TYPES, STYLE_DEFAULTS, defaultFill, defaultSize, emptyBoard, isBoundEnd, isConnector,
  isValidId, type Board, type Connector, type Element, type End, type Head, type Id, type NodeEl,
  type NodeType,
} from '@dbm/core';
import { ALLOWED, ATTR_ORDER, parseAttrValue, type AttrKey } from './attrs';
import { decodeInk } from './ink';
import { lexLine, type Token } from './lexer';

export interface Diagnostic {
  /** 1-based line number */
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface ParseResult {
  board: Board;
  diagnostics: Diagnostic[];
  /** element id → 1-based line where it is defined */
  lineOf: Map<Id, number>;
}

class LineError extends Error {}
const fail = (message: string): never => {
  throw new LineError(message);
};

const HEADS: Record<string, Head> = { '->': 'end', '<->': 'both', '--': 'none' };

const HEADER_RE = /^board(?:\s+(\S+))?(.*)$/;

/** Returns an error message, or undefined when the header is valid. */
function parseHeader(line: string, board: Board): string | undefined {
  const m = HEADER_RE.exec(line)!;
  if (m[1] !== '1') return 'unsupported board version (expected 1)';
  const { tokens, error } = lexLine(m[2] ?? '');
  if (error) return `${error.message} in header`;
  for (const t of tokens) {
    if (t.kind !== 'attr') return `unexpected '${t.text}' in header`;
    const [k, v] = t.value as [string, string];
    if (k === 'sketch' && ['0', '1', '2'].includes(v)) board.sketch = Number(v) as 0 | 1 | 2;
    else if (k === 'bg' && parseAttrValue('stroke', v) !== undefined) board.bg = v as Board['bg'];
    else if (k === 'grid' && ['dots', 'lines', 'none'].includes(v)) board.grid = v as Board['grid'];
    else return `invalid header attribute '${t.text}'`;
  }
  return undefined;
}

/** Applies attr tokens to `el`, validating against the element type. */
function applyAttrs(el: Record<string, unknown>, type: Element['type'], attrs: Token[]) {
  const seen = new Set<string>();
  for (const t of attrs) {
    const [k, raw] = t.value as [string, string];
    if (!(ATTR_ORDER as readonly string[]).includes(k)) fail(`unknown attribute '${k}'`);
    const key = k as AttrKey;
    if (!ALLOWED[type].has(key)) fail(`attribute '${k}' is not valid on ${type}`);
    if (seen.has(key)) fail(`duplicate attribute '${k}'`);
    seen.add(key);
    if (key === 'pts') {
      try {
        el.pts = decodeInk(raw);
      } catch {
        fail('invalid ink data in pts');
      }
      continue;
    }
    const v = parseAttrValue(key, raw);
    if (v === undefined) fail(`invalid value for '${k}': ${raw}`);
    el[key] = v;
  }
}

function parseNode(id: Id, type: NodeType, rest: Token[]): NodeEl {
  const size = defaultSize(type);
  const el: Record<string, unknown> = {
    id, type, x: undefined, y: undefined, w: size.w, h: size.h, rot: 0,
    stroke: STYLE_DEFAULTS.stroke, fill: defaultFill(type), width: STYLE_DEFAULTS.width,
    dash: STYLE_DEFAULTS.dash,
  };
  let str: string | undefined;
  let members: Id[] | undefined;
  const attrs: Token[] = [];
  const once = new Set<string>();
  const mark = (k: string) => (once.has(k) ? fail(`duplicate ${k}`) : once.add(k));
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]!;
    if (t.kind === 'string') {
      mark('text');
      str = t.value as string;
    } else if (t.kind === 'pos') {
      mark('position');
      [el.x, el.y] = t.value as [number, number];
    } else if (t.kind === 'size') {
      mark('size');
      if (type === 'ink') fail('ink has no size');
      [el.w, el.h] = t.value as [number, number];
    } else if (t.kind === 'lbrace') {
      if (type !== 'frame') fail('only frames have members');
      mark('members');
      members = [];
      for (i++; i < rest.length && rest[i]!.kind !== 'rbrace'; i++) {
        const m = rest[i]!;
        if (m.kind !== 'ident' || !isValidId(m.text)) fail(`invalid member '${m.text}'`);
        members.push(m.text);
      }
      if (i >= rest.length) fail("missing '}'");
    } else if (t.kind === 'attr') attrs.push(t);
    else fail(`unexpected '${t.text}'`);
  }
  applyAttrs(el, type, attrs);
  switch (type) {
    case 'box': case 'ellipse': case 'diamond': case 'cylinder':
      if (str !== undefined) el.label = str;
      break;
    case 'text': case 'note': case 'code':
      el.text = str ?? '';
      break;
    case 'frame':
      el.name = str ?? '';
      el.members = members ?? [];
      break;
    case 'image':
      if (str !== undefined) fail('image takes no text');
      if (!el.asset) fail("image needs 'asset='");
      break;
    case 'ink':
      if (str !== undefined) fail('ink takes no text');
      if (!el.pts) fail("ink needs 'pts='");
      el.w = 0;
      el.h = 0;
      break;
  }
  return el as unknown as NodeEl;
}

function toEnd(t: Token | undefined): End {
  if (t?.kind === 'point') {
    const [x, y] = t.value as [number, number];
    return { x, y };
  }
  if (t?.kind === 'ident' && isValidId(t.text)) return { id: t.text };
  return fail(`expected an element id or (x,y), got '${t?.text ?? 'end of line'}'`);
}

function parseConnector(explicitId: Id | undefined, toks: Token[]): Connector {
  const from = toEnd(toks[0]);
  const op = toks[1];
  if (op?.kind !== 'op') fail("expected '->', '<->' or '--'");
  const to = toEnd(toks[2]);
  let id = explicitId;
  if (id === undefined) {
    if (!isBoundEnd(from) || !isBoundEnd(to)) fail('connectors with a free end need an explicit id');
    id = `${(from as { id: Id }).id}-${(to as { id: Id }).id}`;
    if (!isValidId(id)) fail('this connector needs an explicit id');
  }
  const el: Record<string, unknown> = {
    id, type: 'arrow', from, to, head: HEADS[op!.text], route: 'straight',
    stroke: STYLE_DEFAULTS.stroke, fill: 'none', width: STYLE_DEFAULTS.width, dash: STYLE_DEFAULTS.dash,
  };
  const attrs: Token[] = [];
  for (const t of toks.slice(3)) {
    if (t.kind === 'string') {
      if (el.label !== undefined) fail('duplicate label');
      el.label = t.value;
    } else if (t.kind === 'attr') attrs.push(t);
    else fail(`unexpected '${t.text}'`);
  }
  applyAttrs(el, 'arrow', attrs);
  return el as unknown as Connector;
}

function parseElement(tokens: Token[]): Element {
  const [a, b, c] = tokens;
  if (a?.kind === 'ident' && b?.kind === 'colon') {
    if (!isValidId(a.text)) fail(`invalid id '${a.text}'`);
    if (c?.kind === 'ident' && (NODE_TYPES as readonly string[]).includes(c.text)) {
      return parseNode(a.text, c.text as NodeType, tokens.slice(3));
    }
    if (tokens[3]?.kind === 'op') return parseConnector(a.text, tokens.slice(2));
    return fail(`unknown element type '${c?.text ?? ''}'`);
  }
  if (b?.kind === 'op') return parseConnector(undefined, tokens);
  return fail('expected `id: type …` or `a -> b`');
}

export function parse(text: string): ParseResult {
  const board = emptyBoard();
  const diagnostics: Diagnostic[] = [];
  const lineOf = new Map<Id, number>();
  const lines = text.split(/\r?\n/);
  let pending: string[] = [];
  let sawHeader = false;

  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    if (trimmed.startsWith('//')) {
      pending.push(trimmed.slice(2).replace(/^ /, ''));
      return;
    }
    if (!sawHeader) {
      sawHeader = true;
      if (/^board(\s|$)/.test(trimmed)) {
        const headerError = parseHeader(trimmed, board);
        if (headerError) diagnostics.push({ line, severity: 'error', message: headerError });
        return;
      }
      diagnostics.push({ line, severity: 'error', message: "missing header 'board 1'" });
    }
    const { tokens, error } = lexLine(trimmed);
    if (error) {
      diagnostics.push({ line, severity: 'error', message: `${error.message} (col ${error.col + 1})` });
      return;
    }
    try {
      const el = parseElement(tokens);
      const first = lineOf.get(el.id);
      if (first !== undefined) {
        const message = isConnector(el) && !/^\S+:/.test(trimmed)
          ? `connector id '${el.id}' is already used (line ${first}); write it as \`<id>: ${trimmed}\``
          : `duplicate id '${el.id}' (first defined on line ${first})`;
        diagnostics.push({ line, severity: 'error', message });
        return;
      }
      if (pending.length) el.comments = pending;
      pending = [];
      board.elements.push(el);
      lineOf.set(el.id, line);
    } catch (e) {
      if (!(e instanceof LineError)) throw e;
      diagnostics.push({ line, severity: 'error', message: e.message });
    }
  });
  if (!sawHeader) diagnostics.push({ line: 1, severity: 'error', message: "missing header 'board 1'" });
  board.trailingComments = pending;

  for (const el of board.elements) {
    const line = lineOf.get(el.id)!;
    const refs: Id[] = isConnector(el)
      ? [el.from, el.to].filter(isBoundEnd).map((e) => e.id)
      : el.type === 'frame' ? el.members : [];
    for (const r of refs) {
      if (!lineOf.has(r)) diagnostics.push({ line, severity: 'warning', message: `unknown element '${r}'` });
    }
  }
  diagnostics.sort((a, b) => a.line - b.line);
  return { board, diagnostics, lineOf };
}
