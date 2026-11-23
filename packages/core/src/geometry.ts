import type { NodeEl } from './schema';

export interface Rect { x: number; y: number; w: number; h: number }

/** Axis-aligned bounds of a node, ignoring rotation. null when unplaced. */
export function bounds(n: NodeEl): Rect | null {
  if (n.x === undefined || n.y === undefined) return null;
  if (n.type === 'ink') {
    if (n.pts.length === 0) return { x: n.x, y: n.y, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of n.pts) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return { x: n.x + minX, y: n.y + minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

export const center = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function unionRects(rs: Rect[]): Rect | null {
  if (rs.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rs) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
