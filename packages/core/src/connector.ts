import { bounds, center, type Rect } from './geometry';
import { isBoundEnd, isNode, type Connector, type Element, type End, type Id, type NodeEl } from './schema';

export type P = { x: number; y: number };

export interface Anchor {
  rect: Rect;
  shape: NodeEl['type'] | 'point';
}

export function resolveAnchor(end: End, byId: Map<Id, Element>): Anchor | null {
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

export function elbow(a: Anchor, b: Anchor): P[] {
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

export function pointAlong(pts: P[], frac: number): P {
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

/** Returns the path points used for the connector (exported for bounds computation). */
export function connectorPoints(c: Connector, byId: Map<Id, Element>): { pts: P[]; curve?: P } | null {
  const a = resolveAnchor(c.from, byId);
  const b = resolveAnchor(c.to, byId);
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

