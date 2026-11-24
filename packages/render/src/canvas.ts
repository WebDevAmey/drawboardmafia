import {
  bounds, connectorPoints, isConnector, overlaps, type Board, type Connector, type Element,
  type Id, type NodeEl, type Rect,
} from '@dbm/core';
import getStroke from 'perfect-freehand';
import { inkPath } from './shapes';
import { LINE_HEIGHT, measure } from './text';
import { FONT_FAMILY, FONT_PX, makeCtx, type Ctx, type ThemeName } from './theme';

export interface Camera {
  /** world coordinate at the left/top edge of the viewport */
  x: number;
  y: number;
  zoom: number;
}

export interface DrawOptions {
  theme: ThemeName;
  camera: Camera;
  /** CSS pixel size of the canvas */
  width: number;
  height: number;
  dpr: number;
  grid?: 'dots' | 'lines' | 'none';
  /** Element whose text is being edited in a DOM overlay (its text is not drawn). */
  editingId?: Id;
  images?: (asset: string) => CanvasImageSource | undefined;
}

type C2D = CanvasRenderingContext2D;

export const viewportRect = (o: Pick<DrawOptions, 'camera' | 'width' | 'height'>): Rect => ({
  x: o.camera.x, y: o.camera.y, w: o.width / o.camera.zoom, h: o.height / o.camera.zoom,
});

function dash(ctx: C2D, d: Element['dash'], width: number) {
  if (d === 'dashed') ctx.setLineDash([8 + width * 2, 6 + width * 2]);
  else if (d === 'dotted') ctx.setLineDash([0.01, 4 + width * 2]);
  else ctx.setLineDash([]);
  ctx.lineCap = d === 'dotted' ? 'round' : 'butt';
}

function textLines(ctx: C2D, text: string, x: number, top: number, px: number, font: keyof typeof FONT_FAMILY, align: CanvasTextAlign, color: string) {
  ctx.font = `${px}px ${FONT_FAMILY[font]}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  text.split('\n').forEach((line, i) => ctx.fillText(line, x, top + i * px * LINE_HEIGHT + px * 0.95));
}

function drawNode(ctx: C2D, n: NodeEl, c: Ctx, o: DrawOptions) {
  const r = bounds(n);
  if (!r) return;
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const ink = c.stroke(n.stroke);
  const fill = c.fill(n.fill);
  ctx.save();
  if (n.rot) {
    ctx.translate(cx, cy);
    ctx.rotate((n.rot * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = n.width;
  ctx.lineJoin = 'round';
  dash(ctx, n.dash, n.width);
  const fillStroke = () => {
    if (fill !== 'none') {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
  };
  const showText = n.id !== o.editingId;
  switch (n.type) {
    case 'box':
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(8, w / 4, h / 4));
      fillStroke();
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      fillStroke();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      fillStroke();
      break;
    case 'cylinder': {
      const ry = Math.min(h * 0.15, 16);
      ctx.beginPath();
      ctx.moveTo(x, y + ry);
      ctx.lineTo(x, y + h - ry);
      ctx.ellipse(cx, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, y + ry);
      fillStroke();
      ctx.beginPath();
      ctx.ellipse(cx, y + ry, w / 2, ry, 0, 0, Math.PI * 2);
      fillStroke();
      break;
    }
    case 'text': {
      if (!showText) break;
      const align = n.align ?? 'l';
      const ax = align === 'c' ? cx : align === 'r' ? x + w : x;
      textLines(ctx, n.text, ax, y, FONT_PX[n.size ?? 2], n.font ?? 'sans', align === 'c' ? 'center' : align === 'r' ? 'right' : 'left', ink);
      break;
    }
    case 'note': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fillStyle = fill === 'none' ? c.fill('yellow') : fill;
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      if (!showText) break;
      const align = n.align ?? 'l';
      const ax = align === 'c' ? cx : align === 'r' ? x + w - 16 : x + 16;
      textLines(ctx, n.text, ax, y + 16, FONT_PX[n.size ?? 2], n.font ?? 'sans', align === 'c' ? 'center' : align === 'r' ? 'right' : 'left', ink);
      break;
    }
    case 'code':
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fillStyle = fill === 'none' ? c.fill('gray') : fill;
      ctx.fill();
      if (showText) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        textLines(ctx, n.text, x + 12, y + 12, 14, 'mono', 'left', ink);
        ctx.restore();
      }
      break;
    case 'frame':
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      if (fill !== 'none') {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 1 / Math.max(o.camera.zoom, 0.5);
      ctx.stroke();
      if (n.name && showText) textLines(ctx, n.name, x, y - 22, 14, 'sans', 'left', c.muted);
      break;
    case 'image': {
      const img = o.images?.(n.asset);
      if (img) ctx.drawImage(img, x, y, w, h);
      else {
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = c.muted;
        ctx.strokeRect(x, y, w, h);
      }
      break;
    }
    case 'ink': {
      const hasPressure = n.pts.some((p) => p[2] !== 0.5);
      const outline = getStroke(n.pts.map(([px, py, pr]) => [n.x! + px, n.y! + py, pr]), {
        size: n.width * 3 + 2, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: !hasPressure,
      });
      ctx.fillStyle = ink;
      ctx.fill(new Path2D(inkPath(outline)));
      break;
    }
  }
  if ((n.type === 'box' || n.type === 'ellipse' || n.type === 'diamond' || n.type === 'cylinder') && n.label && showText) {
    const px = FONT_PX[n.size ?? 2];
    const { height } = measure(n.label, px, n.font ?? 'sans');
    const ly = n.type === 'cylinder' ? cy + Math.min(h * 0.15, 16) / 2 : cy;
    textLines(ctx, n.label, cx, ly - height / 2, px, n.font ?? 'sans', 'center', ink);
  }
  ctx.restore();
}

function arrowHead(ctx: C2D, tip: { x: number; y: number }, from: { x: number; y: number }, size: number) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x + size * Math.cos(ang + Math.PI - 0.45), tip.y + size * Math.sin(ang + Math.PI - 0.45));
  ctx.lineTo(tip.x + size * Math.cos(ang + Math.PI + 0.45), tip.y + size * Math.sin(ang + Math.PI + 0.45));
  ctx.closePath();
  ctx.fill();
}

function drawConnector(ctx: C2D, el: Connector, byId: Map<Id, Element>, c: Ctx, o: DrawOptions) {
  const geo = connectorPoints(el, byId);
  if (!geo) return;
  const { pts, curve } = geo;
  const color = c.stroke(el.stroke);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = el.width;
  ctx.lineJoin = 'round';
  dash(ctx, el.dash, el.width);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  if (curve) ctx.quadraticCurveTo(curve.x, curve.y, pts[1]!.x, pts[1]!.y);
  else for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const size = 10 + el.width * 2;
  if (el.head !== 'none') arrowHead(ctx, pts[pts.length - 1]!, curve ?? pts[pts.length - 2]!, size);
  if (el.head === 'both') arrowHead(ctx, pts[0]!, curve ?? pts[1]!, size);
  if (el.label && el.id !== o.editingId) {
    const mid = curve
      ? { x: 0.25 * pts[0]!.x + 0.5 * curve.x + 0.25 * pts[1]!.x, y: 0.25 * pts[0]!.y + 0.5 * curve.y + 0.25 * pts[1]!.y }
      : midpoint(pts);
    const m = measure(el.label, 14);
    ctx.fillStyle = c.canvas;
    ctx.fillRect(mid.x - m.width / 2 - 4, mid.y - m.height / 2 - 2, m.width + 8, m.height + 4);
    textLines(ctx, el.label, mid.x, mid.y - m.height / 2, 14, 'sans', 'center', color);
  }
  ctx.restore();
}

export function midpoint(pts: { x: number; y: number }[]) {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let t = segs.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < segs.length; i++) {
    if (t <= segs[i]! || i === segs.length - 1) {
      const f = segs[i] ? t / segs[i]! : 0;
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * f, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * f };
    }
    t -= segs[i]!;
  }
  return pts[0]!;
}

function drawGrid(ctx: C2D, o: DrawOptions, color: string) {
  if (o.grid === 'none') return;
  let step = 24 * o.camera.zoom;
  while (step < 12) step *= 2;
  const ox = -((o.camera.x * o.camera.zoom) % step);
  const oy = -((o.camera.y * o.camera.zoom) % step);
  ctx.fillStyle = color;
  if (o.grid === 'lines') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < o.width; x += step) ctx.moveTo(Math.round(x) + 0.5, 0), ctx.lineTo(Math.round(x) + 0.5, o.height);
    for (let y = oy; y < o.height; y += step) ctx.moveTo(0, Math.round(y) + 0.5), ctx.lineTo(o.width, Math.round(y) + 0.5);
    ctx.stroke();
    return;
  }
  for (let x = ox; x < o.width; x += step) for (let y = oy; y < o.height; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
}

/** Draws the whole scene. The canvas backing store must be width*dpr × height*dpr. */
export function drawBoard(ctx: C2D, board: Board, o: DrawOptions) {
  const c = makeCtx(o.theme);
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.fillStyle = c.canvas;
  ctx.fillRect(0, 0, o.width, o.height);
  drawGrid(ctx, o, o.theme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.12)');
  const { zoom } = o.camera;
  ctx.setTransform(o.dpr * zoom, 0, 0, o.dpr * zoom, -o.camera.x * zoom * o.dpr, -o.camera.y * zoom * o.dpr);
  const view = viewportRect(o);
  const byId = new Map<Id, Element>(board.elements.map((e) => [e.id, e]));
  for (const el of board.elements) {
    if (isConnector(el)) drawConnector(ctx, el, byId, c, o);
    else {
      const r = bounds(el);
      if (!r) continue;
      const pad = el.type === 'frame' ? 30 : el.rot ? Math.max(r.w, r.h) : 20;
      if (!overlaps({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }, view)) continue;
      drawNode(ctx, el, c, o);
    }
  }
}
