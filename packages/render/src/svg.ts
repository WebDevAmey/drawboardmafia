import { bounds, isConnector, isNode, placeUnpositioned, unionRects, type Board, type Element, type Id, type Rect } from '@dbm/core';
import { connectorSvg } from './connectors';
import { connectorPoints } from '@dbm/core';
import { nodeSvg, type AssetResolver } from './shapes';
import { makeCtx, type ThemeName } from './theme';
import { esc, num, tag } from './xml';

export interface RenderOptions {
  theme?: ThemeName;
  /** Render only this frame and its members, cropped to the frame. */
  frame?: Id;
  padding?: number;
  /** Resolve an image asset name (sha256.ext) to an href (usually a data URI). */
  assets?: AssetResolver;
  /** Embed this .board source in <metadata> so the SVG can be re-imported. */
  source?: string;
  /** Draw the canvas background (default true). */
  background?: boolean;
}

const NS = 'urn:drawboardmafia:board:1';

export function renderSvg(input: Board, opts: RenderOptions = {}): string {
  const board = placeUnpositioned(input);
  const ctx = makeCtx(opts.theme ?? 'light');
  const pad = opts.padding ?? 32;
  const byId = new Map<Id, Element>(board.elements.map((e) => [e.id, e]));

  let elements = board.elements;
  let area: Rect | null;
  if (opts.frame !== undefined) {
    const f = byId.get(opts.frame);
    if (!f || f.type !== 'frame') throw new Error(`no frame with id '${opts.frame}'`);
    const keep = new Set<Id>([f.id, ...f.members]);
    elements = elements.filter((e) =>
      isConnector(e)
        ? [e.from, e.to].every((end) => !('id' in end) || keep.has(end.id))
        : keep.has(e.id),
    );
    area = bounds(f);
  } else {
    const rects: Rect[] = [];
    for (const e of elements) {
      if (isNode(e)) {
        const r = bounds(e);
        if (r) rects.push(e.type === 'frame' ? { ...r, y: r.y - 24, h: r.h + 24 } : r);
      } else {
        const geo = connectorPoints(e, byId);
        if (geo) for (const p of [...geo.pts, ...(geo.curve ? [geo.curve] : [])]) rects.push({ x: p.x, y: p.y, w: 0, h: 0 });
      }
    }
    area = unionRects(rects);
  }
  const r = area ?? { x: 0, y: 0, w: 0, h: 0 };
  const vb = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };

  const body = elements
    .map((e) => (isConnector(e) ? connectorSvg(e, byId, ctx) : nodeSvg(e, ctx, opts.assets)))
    .join('');
  const meta = opts.source === undefined ? '' : `<metadata><board xmlns="${NS}">${esc(opts.source)}</board></metadata>`;
  const bg = opts.background === false ? '' : tag('rect', { x: vb.x, y: vb.y, width: vb.w, height: vb.h, fill: ctx.canvas });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(vb.x)} ${num(vb.y)} ${num(vb.w)} ${num(vb.h)}" width="${num(vb.w)}" height="${num(vb.h)}">` +
    meta + bg + body + '</svg>\n'
  );
}

const UNESC: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Returns the .board source embedded by renderSvg({ source }), if any. */
export function extractBoardSource(svg: string): string | undefined {
  const m = svg.match(new RegExp(`<board xmlns="${NS}">([\\s\\S]*?)</board>`));
  return m ? m[1]!.replace(/&(amp|lt|gt|quot|#39);/g, (e) => UNESC[e]!) : undefined;
}
