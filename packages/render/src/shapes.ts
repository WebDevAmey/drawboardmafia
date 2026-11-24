import { bounds, type NodeEl } from '@dbm/core';
import getStroke from 'perfect-freehand';
import { centeredText, textSvg } from './text';
import { FONT_PX, dashArray, type Ctx } from './theme';
import { tag } from './xml';

export type AssetResolver = (asset: string) => string | undefined;

function strokeAttrs(n: NodeEl, ctx: Ctx) {
  return {
    stroke: ctx.stroke(n.stroke),
    'stroke-width': n.width,
    'stroke-dasharray': dashArray(n.dash, n.width),
    'stroke-linecap': n.dash === 'dotted' ? 'round' : undefined,
    'stroke-linejoin': 'round',
  };
}

function inkPath(points: number[][]): string {
  if (!points.length) return '';
  const d = points.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]!;
      acc.push(Math.round(x0! * 100) / 100, Math.round(y0! * 100) / 100, Math.round(((x0! + x1!) / 2) * 100) / 100, Math.round(((y0! + y1!) / 2) * 100) / 100);
      return acc;
    },
    ['M', ...points[0]!.map((v) => Math.round(v * 100) / 100), 'Q'],
  );
  return d.join(' ') + ' Z';
}

export function nodeSvg(n: NodeEl, ctx: Ctx, assets?: AssetResolver): string {
  const b = bounds(n);
  if (!b) return '';
  const { x, y, w, h } = b;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const fill = ctx.fill(n.fill);
  const ink = ctx.stroke(n.stroke);
  const sa = strokeAttrs(n, ctx);
  let body = '';
  switch (n.type) {
    case 'box':
      body = tag('rect', { x, y, width: w, height: h, rx: Math.min(8, w / 4, h / 4), fill, ...sa });
      break;
    case 'ellipse':
      body = tag('ellipse', { cx, cy, rx: w / 2, ry: h / 2, fill, ...sa });
      break;
    case 'diamond':
      body = tag('polygon', { points: `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`, fill, ...sa });
      break;
    case 'cylinder': {
      const ry = Math.min(h * 0.15, 16);
      body =
        tag('path', { d: `M ${x} ${y + ry} V ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} V ${y + ry}`, fill, ...sa }) +
        tag('ellipse', { cx, cy: y + ry, rx: w / 2, ry, fill, ...sa });
      break;
    }
    case 'text': {
      const px = FONT_PX[n.size ?? 2];
      const align = n.align ?? 'l';
      const ax = align === 'c' ? cx : align === 'r' ? x + w : x;
      body = textSvg(n.text, { x: ax, y, px, font: n.font ?? 'sans', align, color: ink });
      break;
    }
    case 'note': {
      const px = FONT_PX[n.size ?? 2];
      const align = n.align ?? 'l';
      const pad = 16;
      const ax = align === 'c' ? cx : align === 'r' ? x + w - pad : x + pad;
      body =
        tag('rect', { x, y, width: w, height: h, rx: 4, fill, stroke: 'none' }) +
        textSvg(n.text, { x: ax, y: y + pad, px, font: n.font ?? 'sans', align, color: ink });
      break;
    }
    case 'code':
      body =
        tag('rect', { x, y, width: w, height: h, rx: 6, fill, stroke: 'none' }) +
        textSvg(n.text, { x: x + 12, y: y + 12, px: 14, font: 'mono', align: 'l', color: ink, preserve: true });
      break;
    case 'frame':
      body =
        tag('rect', { x, y, width: w, height: h, rx: 8, fill, stroke: ctx.muted, 'stroke-width': 1 }) +
        (n.name ? textSvg(n.name, { x, y: y - 22, px: 14, font: 'sans', align: 'l', color: ctx.muted }) : '');
      break;
    case 'image': {
      const href = assets?.(n.asset);
      body = href
        ? tag('image', { x, y, width: w, height: h, href, preserveAspectRatio: 'xMidYMid meet' })
        : tag('rect', { x, y, width: w, height: h, fill: 'none', stroke: ctx.muted, 'stroke-dasharray': '6 6' }) +
          centeredText('image', cx, cy, 14, 'sans', ctx.muted);
      break;
    }
    case 'ink': {
      const hasPressure = n.pts.some((p) => p[2] !== 0.5);
      const outline = getStroke(
        n.pts.map(([px, py, pr]) => [n.x! + px, n.y! + py, pr]),
        { size: n.width * 3 + 2, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: !hasPressure },
      );
      body = tag('path', { d: inkPath(outline), fill: ink, stroke: 'none' });
      break;
    }
  }
  if ((n.type === 'box' || n.type === 'ellipse' || n.type === 'diamond' || n.type === 'cylinder') && n.label) {
    const labelY = n.type === 'cylinder' ? cy + Math.min(h * 0.15, 16) / 2 : cy;
    body += centeredText(n.label, cx, labelY, FONT_PX[n.size ?? 2], n.font ?? 'sans', ink);
  }
  const rot = n.rot ? `rotate(${n.rot} ${cx} ${cy})` : undefined;
  return tag('g', { 'data-id': n.id, transform: rot }, body);
}
