import {
  STYLE_DEFAULTS, defaultFill, defaultSize, isBoundEnd, isConnector, type Board, type Connector,
  type Element, type End, type NodeEl,
} from '@dbm/core';
import { ATTR_ORDER, type AttrKey } from './attrs';
import { encodeInk } from './ink';

const OPS = { end: '->', both: '<->', none: '--' } as const;

export function quote(s: string): string {
  return `"${s.replace(/\r\n?/g, '\n').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

const int = (n: number) => String(Math.round(n) || 0);

function normRot(r: number): number {
  const n = Math.round((r % 360) * 10) / 10;
  return Math.abs(n) >= 360 || Object.is(n, -0) ? 0 : n;
}

/** Attribute values that differ from their defaults, keyed by attr name. */
function attrValues(el: Element): Partial<Record<AttrKey, string>> {
  const out: Partial<Record<AttrKey, string>> = {};
  const e = el as unknown as Record<string, unknown>;
  if (el.stroke !== STYLE_DEFAULTS.stroke) out.stroke = el.stroke;
  if (el.width !== STYLE_DEFAULTS.width) out.width = String(el.width);
  if (el.dash !== STYLE_DEFAULTS.dash) out.dash = el.dash;
  if (el.sketch !== undefined) out.sketch = String(el.sketch);
  if (el.locked) out.locked = 'true';
  if (el.group !== undefined) out.group = el.group;
  if (isConnector(el)) {
    if (el.route !== 'straight') out.route = el.route;
    if (el.via?.length) out.via = el.via.map(([x, y]) => `${int(x)},${int(y)}`).join(';');
    return out;
  }
  if (el.type !== 'ink' && el.fill !== defaultFill(el.type)) out.fill = el.fill;
  const rot = normRot(el.rot);
  if (rot !== 0) out.rot = String(rot);
  for (const k of ['font', 'size', 'align', 'lang', 'asset'] as const) {
    if (e[k] !== undefined) out[k] = String(e[k]);
  }
  if (el.type === 'ink') out.pts = encodeInk(el.pts);
  return out;
}

function attrsText(el: Element): string {
  const vals = attrValues(el);
  return ATTR_ORDER.filter((k) => vals[k] !== undefined)
    .map((k) => {
      const v = vals[k]!;
      return ` ${k}=${/^[^\s"{}()]+$/.test(v) ? v : quote(v)}`;
    })
    .join('');
}

const endText = (e: End) => (isBoundEnd(e) ? e.id : `(${int(e.x)},${int(e.y)})`);

function connectorLine(c: Connector): string {
  const implicit = isBoundEnd(c.from) && isBoundEnd(c.to) && c.id === `${c.from.id}-${c.to.id}`;
  let s = `${implicit ? '' : `${c.id}: `}${endText(c.from)} ${OPS[c.head]} ${endText(c.to)}`;
  if (c.label !== undefined) s += ` ${quote(c.label)}`;
  return s + attrsText(c);
}

function nodeLine(n: NodeEl): string {
  let s = `${n.id}: ${n.type}`;
  switch (n.type) {
    case 'box': case 'ellipse': case 'diamond': case 'cylinder':
      if (n.label !== undefined) s += ` ${quote(n.label)}`;
      break;
    case 'text': case 'note': case 'code':
      if (n.text !== '') s += ` ${quote(n.text)}`;
      break;
    case 'frame':
      if (n.name !== '') s += ` ${quote(n.name)}`;
      break;
  }
  if (n.x !== undefined && n.y !== undefined) s += ` @${int(n.x)},${int(n.y)}`;
  if (n.type !== 'ink') {
    const d = defaultSize(n.type);
    const w = Math.max(0, Math.round(n.w));
    const h = Math.max(0, Math.round(n.h));
    if (w !== d.w || h !== d.h) s += ` ${w}x${h}`;
  }
  if (n.type === 'frame' && n.members.length) s += ` { ${n.members.join(' ')} }`;
  return s + attrsText(n);
}

const commentLines = (cs: string[] | undefined) =>
  (cs ?? []).flatMap((c) => c.split(/\r?\n/)).map((c) => (c.trimEnd() === '' ? '//' : `// ${c.trimEnd()}`));

/** Canonical, deterministic text form of a board. Always ends with a newline. */
export function serialize(board: Board): string {
  let header = 'board 1';
  if (board.sketch !== 0) header += ` sketch=${board.sketch}`;
  if (board.bg !== undefined) header += ` bg=${board.bg}`;
  if (board.grid !== undefined) header += ` grid=${board.grid}`;
  const lines = [header];
  for (const el of board.elements) {
    lines.push(...commentLines(el.comments));
    lines.push(isConnector(el) ? connectorLine(el) : nodeLine(el));
  }
  lines.push(...commentLines(board.trailingComments));
  return lines.join('\n') + '\n';
}
