import { bounds, connectorPoints, isConnector, sampleQuad, type Element, type Id, type NodeEl } from '@dbm/core';
import type { DrawOptions } from '@dbm/render';
import getStroke from 'perfect-freehand';
import type { Editor } from './editor';
import { rectFrom } from './editor';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_PX = 8;

const accent = (theme: DrawOptions['theme']) => (theme === 'dark' ? '#7aa2ff' : '#3b6cf6');

/** Screen-space handle positions for the single selected node (unrotated nodes only). */
function handlePoints(editor: Editor): { h: Handle; x: number; y: number }[] {
  const n = editor.selectedNode();
  if (!n || n.rot) return [];
  const r = bounds(n)!;
  const a = editor.toScreen({ x: r.x, y: r.y });
  const b = editor.toScreen({ x: r.x + r.w, y: r.y + r.h });
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const pos: Record<Handle, [number, number]> = {
    nw: [a.x, a.y], n: [mx, a.y], ne: [b.x, a.y], e: [b.x, my], se: [b.x, b.y], s: [mx, b.y], sw: [a.x, b.y], w: [a.x, my],
  };
  const small = b.x - a.x < 40 || b.y - a.y < 40;
  return HANDLES.filter((h) => !small || h.length === 2).map((h) => ({ h, x: pos[h][0], y: pos[h][1] }));
}

export function handleAt(editor: Editor, s: { x: number; y: number }): Handle | undefined {
  return handlePoints(editor).find((p) => Math.abs(p.x - s.x) <= HANDLE_PX && Math.abs(p.y - s.y) <= HANDLE_PX)?.h;
}

function outlineNode(ctx: CanvasRenderingContext2D, editor: Editor, n: NodeEl, pad: number) {
  const r = bounds(n);
  if (!r) return;
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const corners = [
    [r.x - pad, r.y - pad], [r.x + r.w + pad, r.y - pad], [r.x + r.w + pad, r.y + r.h + pad], [r.x - pad, r.y + r.h + pad],
  ].map(([x, y]) => {
    if (!n.rot) return editor.toScreen({ x: x!, y: y! });
    const t = (n.rot * Math.PI) / 180;
    const dx = x! - c.x;
    const dy = y! - c.y;
    return editor.toScreen({ x: c.x + dx * Math.cos(t) - dy * Math.sin(t), y: c.y + dx * Math.sin(t) + dy * Math.cos(t) });
  });
  ctx.beginPath();
  corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
}

function outlineConnector(ctx: CanvasRenderingContext2D, editor: Editor, el: Element, byId: Map<Id, Element>) {
  if (!isConnector(el)) return;
  const geo = connectorPoints(el, byId);
  if (!geo) return;
  const pts = (geo.curve ? sampleQuad(geo.pts[0]!, geo.curve, geo.pts[1]!) : geo.pts).map((p) => editor.toScreen(p));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  for (const p of [pts[0]!, pts[pts.length - 1]!]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawOverlay(ctx: CanvasRenderingContext2D, editor: Editor, o: DrawOptions) {
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, o.width, o.height);
  const color = accent(o.theme);
  const board = editor.board;
  const byId = new Map(board.elements.map((e) => [e.id, e]));
  const { selection, editingId } = editor.state;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  // hover
  if (editor.hover && !selection.includes(editor.hover) && !editor.gesture) {
    const el = byId.get(editor.hover);
    ctx.globalAlpha = 0.5;
    if (el && isConnector(el)) outlineConnector(ctx, editor, el, byId);
    else if (el) outlineNode(ctx, editor, el as NodeEl, 2);
    ctx.globalAlpha = 1;
  }

  // selection
  for (const id of selection) {
    if (id === editingId) continue;
    const el = byId.get(id);
    if (!el) continue;
    if (isConnector(el)) outlineConnector(ctx, editor, el, byId);
    else outlineNode(ctx, editor, el, 3 / editor.camera.zoom);
  }
  if (!editor.gesture || editor.gesture.kind === 'resize') {
    for (const p of handlePoints(editor)) {
      ctx.fillStyle = o.theme === 'dark' ? '#16171a' : '#ffffff';
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
    }
  }

  const g = editor.gesture;
  if (!g) return;
  ctx.fillStyle = color;
  if (g.kind === 'marquee') {
    const r = rectFrom(editor.toScreen(g.start), editor.toScreen(g.now));
    ctx.globalAlpha = 0.08;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  } else if (g.kind === 'create') {
    const r = rectFrom(editor.toScreen(g.start), editor.toScreen(g.now));
    ctx.setLineDash([4, 4]);
    if (g.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (g.type === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(r.x + r.w / 2, r.y);
      ctx.lineTo(r.x + r.w, r.y + r.h / 2);
      ctx.lineTo(r.x + r.w / 2, r.y + r.h);
      ctx.lineTo(r.x, r.y + r.h / 2);
      ctx.closePath();
      ctx.stroke();
    } else ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
  } else if (g.kind === 'arrow') {
    if (g.target) {
      const t = byId.get(g.target);
      if (t) outlineNode(ctx, editor, t as NodeEl, 4 / editor.camera.zoom);
    }
    const a = editor.toScreen(g.start);
    const b = editor.toScreen(g.now);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (g.kind === 'ink') {
    const outline = getStroke(
      g.pts.map((p, i) => [p.x, p.y, g.pressures[i]!]),
      { size: 8, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: g.pressures.every((p) => p === 0.5), last: false },
    );
    ctx.setTransform(o.dpr * o.camera.zoom, 0, 0, o.dpr * o.camera.zoom, -o.camera.x * o.camera.zoom * o.dpr, -o.camera.y * o.camera.zoom * o.dpr);
    ctx.fillStyle = o.theme === 'dark' ? '#e4e4e2' : '#1e1e1e';
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!)));
    ctx.closePath();
    ctx.fill();
  }
}
