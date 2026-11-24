import { connectorPoints, type P } from './connector';
import { bounds, center, type Rect } from './geometry';
import { isConnector, type Board, type Element, type Id, type NodeEl } from './schema';

function distToSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const distToPolyline = (p: P, pts: P[]): number =>
  pts.length === 1 ? Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) : Math.min(...pts.slice(1).map((b, i) => distToSegment(p, pts[i]!, b)));

/** Rotates p around c by -deg (into the node's unrotated frame). */
function toLocal(p: P, c: P, deg: number): P {
  if (!deg) return p;
  const r = (-deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

function hitNode(n: NodeEl, p: P, tol: number): boolean {
  const r = bounds(n);
  if (!r) return false;
  if (n.type === 'ink') {
    const pts = n.pts.map(([x, y]) => ({ x: n.x! + x, y: n.y! + y }));
    return pts.length > 0 && distToPolyline(p, pts) <= tol + n.width * 2;
  }
  const c = center(r);
  const q = toLocal(p, c, n.rot);
  const inside = (pad: number) => q.x >= r.x - pad && q.x <= r.x + r.w + pad && q.y >= r.y - pad && q.y <= r.y + r.h + pad;
  if (n.type === 'frame') {
    const label = q.x >= r.x && q.x <= r.x + Math.max(80, r.w / 2) && q.y >= r.y - 24 && q.y < r.y;
    const border = inside(tol) && !(q.x > r.x + tol && q.x < r.x + r.w - tol && q.y > r.y + tol && q.y < r.y + r.h - tol);
    return label || border;
  }
  if (!inside(tol)) return false;
  const hw = r.w / 2 + tol;
  const hh = r.h / 2 + tol;
  const dx = q.x - c.x;
  const dy = q.y - c.y;
  if (n.type === 'ellipse') return (dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) <= 1;
  if (n.type === 'diamond') return Math.abs(dx) / hw + Math.abs(dy) / hh <= 1;
  return true;
}

/** Topmost element under `p` (world coordinates), or undefined. */
export function hitTest(board: Board, p: P, tolerance = 4): Id | undefined {
  const byId = new Map(board.elements.map((e) => [e.id, e]));
  for (let i = board.elements.length - 1; i >= 0; i--) {
    const el = board.elements[i]!;
    if (isConnector(el)) {
      const geo = connectorPoints(el, byId);
      if (!geo) continue;
      const pts = geo.curve ? sampleQuad(geo.pts[0]!, geo.curve, geo.pts[1]!) : geo.pts;
      if (distToPolyline(p, pts) <= tolerance + el.width + 2) return el.id;
    } else if (hitNode(el, p, tolerance)) return el.id;
  }
  return undefined;
}

export function sampleQuad(a: P, c: P, b: P, n = 16): P[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  });
}

/** World-space bounds of any element (connectors: their path), or null. */
export function elementBounds(el: Element, byId: Map<Id, Element>): Rect | null {
  if (!isConnector(el)) return bounds(el);
  const geo = connectorPoints(el, byId);
  if (!geo) return null;
  const pts = geo.curve ? [...geo.pts, geo.curve] : geo.pts;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Ids of elements entirely inside `rect`, in paint order. */
export function elementsInRect(board: Board, rect: Rect): Id[] {
  const byId = new Map(board.elements.map((e) => [e.id, e]));
  return board.elements
    .filter((el) => {
      const r = elementBounds(el, byId);
      return !!r && r.x >= rect.x && r.y >= rect.y && r.x + r.w <= rect.x + rect.w && r.y + r.h <= rect.y + rect.h;
    })
    .map((el) => el.id);
}
