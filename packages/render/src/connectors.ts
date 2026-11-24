import { bounds, center, isBoundEnd, isNode, type Connector, type Element, type End, type Id, type NodeEl } from '@dbm/core';
import type { Rect } from '@dbm/core';
import { centeredText, measure } from './text';
import { dashArray, type Ctx } from './theme';
import { tag } from './xml';

type P = { x: number; y: number };

interface Anchor {
  rect: Rect;
  shape: NodeEl['type'] | 'point';
}

function resolve(end: End, byId: Map<Id, Element>): Anchor | null {
  if (!isBoundEnd(end)) return { rect: { x: end.x, y: end.y, w: 0, h: 0 }, shape: 'point' };
  const el = byId.get(end.id);
  if (!el || !isNode(el)) return null;
  const r = bounds(el);
  return r ? { rect: r, shape: el.type } : null;
}

/** Point where the ray from the anchor's center towards `toward` leaves its outline. */
export function clip(a: Anchor, toward: P): P {
  const c = center(a.rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (a.shape === 'point' || (dx === 0 && dy === 0)) return c;
  const hw = a.rect.w / 2;
  const hh = a.rect.h / 2;
  let t: number;
  if (a.shape === 'ellipse') t = 1 / Math.sqrt((dx * dx) / (hw * hw || 1) + (dy * dy) / (hh * hh || 1));
  else if (a.shape === 'diamond') t = 1 / (Math.abs(dx) / (hw || 1) + Math.abs(dy) / (hh || 1));
  else t = Math.min(hw / (Math.abs(dx) || 1e-9), hh / (Math.abs(dy) || 1e-9));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function elbow(a: Anchor, b: Anchor): P[] {
  const ca = center(a.rect);
  const cb = center(b.rect);
  if (Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y)) {
    const s = Math.sign(cb.x - ca.x) || 1;
    const p1 = { x: ca.x + (s * a.rect.w) / 2, y: ca.y };
    const p2 = { x: cb.x - (s * b.rect.w) / 2, y: cb.y };
    const mx = (p1.x + p2.x) / 2;
    return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
  }
  const s = Math.sign(cb.y - ca.y) || 1;
  const p1 = { x: ca.x, y: ca.y + (s * a.rect.h) / 2 };
  const p2 = { x: cb.x, y: cb.y - (s * b.rect.h) / 2 };
  const my = (p1.y + p2.y) / 2;
  return [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
}

function pointAlong(pts: P[], frac: number): P {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let target = segs.reduce((s, l) => s + l, 0) * frac;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]! || i === segs.length - 1) {
      const t = segs[i]! === 0 ? 0 : target / segs[i]!;
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t };
    }
    target -= segs[i]!;
  }
  return pts[0]!;
}

function head(tip: P, from: P, size: number, color: string): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const a1 = ang + Math.PI - 0.45;
  const a2 = ang + Math.PI + 0.45;
  const pts = [tip, { x: tip.x + size * Math.cos(a1), y: tip.y + size * Math.sin(a1) }, { x: tip.x + size * Math.cos(a2), y: tip.y + size * Math.sin(a2) }];
  return tag('polygon', { points: pts.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(' '), fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round' });
}

/** Returns the path points used for the connector (exported for bounds computation). */
export function connectorPoints(c: Connector, byId: Map<Id, Element>): { pts: P[]; curve?: P } | null {
  const a = resolve(c.from, byId);
  const b = resolve(c.to, byId);
  if (!a || !b) return null;
  const via = (c.via ?? []).map(([x, y]) => ({ x, y }));
  if (c.route === 'elbow' && via.length === 0) return { pts: elbow(a, b) };
  const first = via[0] ?? center(b.rect);
  const last = via[via.length - 1] ?? center(a.rect);
  const p1 = clip(a, first);
  const p2 = clip(b, last);
  if (c.route === 'curve' && via.length === 0) {
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const nx = -(p2.y - p1.y) / (len || 1);
    const ny = (p2.x - p1.x) / (len || 1);
    return { pts: [p1, p2], curve: { x: mx + nx * len * 0.2, y: my + ny * len * 0.2 } };
  }
  return { pts: [p1, ...via, p2] };
}

export function connectorSvg(c: Connector, byId: Map<Id, Element>, ctx: Ctx): string {
  const geo = connectorPoints(c, byId);
  if (!geo) return '';
  const { pts, curve } = geo;
  const color = ctx.stroke(c.stroke);
  const f = (p: P) => `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;
  const d = curve
    ? `M ${f(pts[0]!)} Q ${f(curve)} ${f(pts[1]!)}`
    : `M ${f(pts[0]!)} ` + pts.slice(1).map((p) => `L ${f(p)}`).join(' ');
  let out = tag('path', {
    d, fill: 'none', stroke: color, 'stroke-width': c.width,
    'stroke-dasharray': dashArray(c.dash, c.width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  const size = 10 + c.width * 2;
  const endFrom = curve ?? pts[pts.length - 2]!;
  const startFrom = curve ?? pts[1]!;
  if (c.head === 'end' || c.head === 'both') out += head(pts[pts.length - 1]!, endFrom, size, color);
  if (c.head === 'both') out += head(pts[0]!, startFrom, size, color);
  if (c.label) {
    const mid = curve
      ? { x: 0.25 * pts[0]!.x + 0.5 * curve.x + 0.25 * pts[1]!.x, y: 0.25 * pts[0]!.y + 0.5 * curve.y + 0.25 * pts[1]!.y }
      : pointAlong(pts, 0.5);
    const m = measure(c.label, 14);
    out += tag('rect', { x: mid.x - m.width / 2 - 4, y: mid.y - m.height / 2 - 2, width: m.width + 8, height: m.height + 4, rx: 4, fill: ctx.canvas });
    out += centeredText(c.label, mid.x, mid.y, 14, 'sans', color);
  }
  return tag('g', { 'data-id': c.id }, out);
}
