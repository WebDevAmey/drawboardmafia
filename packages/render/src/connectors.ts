import { connectorPoints, pointAlong, type Connector, type Element, type Id } from '@dbm/core';
import { centeredText, measure } from './text';
import { dashArray, type Ctx } from './theme';
import { tag } from './xml';

type P = { x: number; y: number };

function head(tip: P, from: P, size: number, color: string): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const a1 = ang + Math.PI - 0.45;
  const a2 = ang + Math.PI + 0.45;
  const pts = [tip, { x: tip.x + size * Math.cos(a1), y: tip.y + size * Math.sin(a1) }, { x: tip.x + size * Math.cos(a2), y: tip.y + size * Math.sin(a2) }];
  return tag('polygon', { points: pts.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(' '), fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round' });
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
