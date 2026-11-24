import {
  PALETTE_TOKENS, STYLE_DEFAULTS, THEMES, emptyBoard, type Board, type Color, type Connector,
  type Element, type End, type Font, type FontSize, type InkPoint, type NodeEl, type Sketch, type Style,
} from '@dbm/core';
import type { Diagnostic } from '../parse';
import { IdAllocator } from './ids';

type X = Record<string, unknown>;

const FONT_PX: [FontSize, number][] = [[1, 14], [2, 18], [3, 24], [4, 32]];
const FONTS: Record<number, Font> = { 1: 'hand', 2: 'sans', 3: 'mono', 5: 'hand', 6: 'sans', 7: 'sans', 8: 'mono' };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = Math.round;

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  if (!/^#[0-9a-f]{6}$/.test(h)) return null;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** sRGB (0-255) → OKLab, for perceptual color distance. */
function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Max OKLab distance for snapping a hex color to a palette token. */
const SNAP = 0.09;

/** Nearest palette token when perceptually close, else the normalized hex. */
function mapColor(raw: unknown, fallback: Color | 'none'): Color | 'none' {
  if (typeof raw !== 'string' || raw === 'transparent') return raw === 'transparent' ? 'none' : fallback;
  const rgb = hexToRgb(raw);
  if (!rgb) return fallback;
  const target = oklab(rgb);
  let best: { token: Color; d: number } | null = null;
  for (const palette of [THEMES.light.stroke, THEMES.light.fill]) {
    for (const token of PALETTE_TOKENS) {
      const p = oklab(hexToRgb(palette[token])!);
      const d = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
      if (!best || d < best.d) best = { token, d };
    }
  }
  if (best && best.d < SNAP) return best.token;
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}` as Color;
}

const nearestSize = (px: unknown): FontSize | undefined => {
  if (!isNum(px)) return undefined;
  let best = FONT_PX[0]!;
  for (const s of FONT_PX) if (Math.abs(s[1] - px) < Math.abs(best[1] - px)) best = s;
  return best[0] === 2 ? undefined : best[0];
};

export function fromExcalidraw(json: unknown): { board: Board; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const board = emptyBoard();
  const warn = (message: string) => diagnostics.push({ line: 0, severity: 'warning', message });
  if (!json || typeof json !== 'object' || !Array.isArray((json as X).elements)) {
    diagnostics.push({ line: 0, severity: 'error', message: 'not an Excalidraw file (missing "elements" array)' });
    return { board, diagnostics };
  }
  const raw = ((json as X).elements as unknown[]).filter((e, i) => {
    const ok = !!e && typeof e === 'object' && typeof (e as X).id === 'string' && typeof (e as X).type === 'string'
      && isNum((e as X).x) && isNum((e as X).y);
    if (!ok) warn(`skipped malformed element #${i}`);
    return ok;
  }) as X[];
  const live = raw.filter((e) => !e.isDeleted);
  const ids = new IdAllocator();
  const idOf = new Map<string, string>();
  for (const e of live) if (e.type !== 'text' || !e.containerId) idOf.set(e.id as string, ids.anon(e.id as string));
  const boundText = new Map<string, X>();
  for (const e of live) if (e.type === 'text' && typeof e.containerId === 'string') boundText.set(e.containerId, e);
  const groupId = new Map<string, string>();
  const groupOf = (e: X) => {
    const g = Array.isArray(e.groupIds) ? e.groupIds[0] : undefined;
    if (typeof g !== 'string') return undefined;
    if (!groupId.has(g)) groupId.set(g, ids.anon(`group:${g}`));
    return groupId.get(g);
  };

  const roughness = new Map<string, Sketch>();
  const style = (e: X, fill: Color | 'none' = 'none'): Style => {
    const s: Style = {
      stroke: mapColor(e.strokeColor, STYLE_DEFAULTS.stroke) as Color,
      fill: mapColor(e.backgroundColor, fill),
      width: e.strokeWidth === 1 ? 1 : isNum(e.strokeWidth) && e.strokeWidth >= 3 ? 4 : 2,
      dash: e.strokeStyle === 'dashed' || e.strokeStyle === 'dotted' ? e.strokeStyle : 'solid',
    };
    if (s.stroke === 'none' as unknown) s.stroke = STYLE_DEFAULTS.stroke;
    if (e.locked === true) s.locked = true;
    const g = groupOf(e);
    if (g) s.group = g;
    return s;
  };
  const rot = (e: X) => (isNum(e.angle) ? Math.round(((e.angle * 180) / Math.PI) * 10) / 10 % 360 : 0);
  const geom = (e: X) => ({ x: round(e.x as number), y: round(e.y as number), w: round(isNum(e.width) ? Math.abs(e.width) : 0), h: round(isNum(e.height) ? Math.abs(e.height) : 0), rot: rot(e) });
  const points = (e: X): [number, number][] =>
    Array.isArray(e.points) ? (e.points as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) : [];

  const out: Element[] = [];
  for (const e of live) {
    const id = idOf.get(e.id as string);
    if (!id) continue; // bound text, merged into its container
    const r = e.roughness === 0 || e.roughness === 1 || e.roughness === 2 ? (e.roughness as Sketch) : 1;
    let el: Element | undefined;
    switch (e.type) {
      case 'rectangle': case 'ellipse': case 'diamond': {
        const t = boundText.get(e.id as string);
        const n: NodeEl = { id, type: e.type === 'rectangle' ? 'box' : e.type, ...geom(e), ...style(e) } as NodeEl;
        if (t && typeof (t.originalText ?? t.text) === 'string') {
          Object.assign(n, { label: (t.originalText ?? t.text) as string });
          const font = FONTS[t.fontFamily as number];
          if (font && font !== 'sans') Object.assign(n, { font });
          const size = nearestSize(t.fontSize);
          if (size) Object.assign(n, { size });
        }
        el = n;
        break;
      }
      case 'text': {
        const font = FONTS[e.fontFamily as number];
        const size = nearestSize(e.fontSize);
        const align = e.textAlign === 'center' ? 'c' : e.textAlign === 'right' ? 'r' : undefined;
        el = {
          id, type: 'text', text: String(e.originalText ?? e.text ?? ''), ...geom(e), ...style(e),
          ...(font && font !== 'sans' ? { font } : {}), ...(size ? { size } : {}), ...(align ? { align } : {}),
        } as Element;
        break;
      }
      case 'arrow': case 'line': {
        const pts = points(e);
        if (pts.length < 2) {
          warn(`skipped ${e.type} with fewer than 2 points`);
          continue;
        }
        const abs = pts.map(([px, py]) => [round((e.x as number) + px), round((e.y as number) + py)] as [number, number]);
        const end = (binding: unknown, p: [number, number]): End => {
          const bid = binding && typeof binding === 'object' ? (binding as X).elementId : undefined;
          const mapped = typeof bid === 'string' ? idOf.get(bid) : undefined;
          return mapped ? { id: mapped } : { x: p[0], y: p[1] };
        };
        const s = !!e.startArrowhead;
        const t = !!e.endArrowhead;
        const c: Connector = {
          id, type: 'arrow', from: end(e.startBinding, abs[0]!), to: end(e.endBinding, abs[abs.length - 1]!),
          head: s && t ? 'both' : t || s ? 'end' : 'none', route: e.elbowed === true ? 'elbow' : 'straight',
          ...style(e), fill: 'none',
        };
        if (s && !t) [c.from, c.to] = [c.to, c.from];
        if (abs.length > 2 && c.route !== 'elbow') c.via = abs.slice(1, -1);
        const label = boundText.get(e.id as string);
        if (label && typeof (label.originalText ?? label.text) === 'string') c.label = String(label.originalText ?? label.text);
        el = c;
        break;
      }
      case 'freedraw': {
        const pressures = Array.isArray(e.pressures) ? (e.pressures as unknown[]) : [];
        const pts: InkPoint[] = points(e).map(([px, py], i) => [round(px), round(py), isNum(pressures[i]) ? (pressures[i] as number) : 0.5]);
        el = { id, type: 'ink', ...geom(e), w: 0, h: 0, pts, ...style(e), fill: 'none' } as Element;
        break;
      }
      case 'frame': case 'magicframe':
        el = { id, type: 'frame', name: typeof e.name === 'string' ? e.name : '', members: [], ...geom(e), ...style(e), stroke: 'ink', fill: 'none' } as Element;
        break;
      default:
        warn(`skipped unsupported element type '${String(e.type)}'`);
        continue;
    }
    roughness.set(id, r);
    out.push(el);
  }

  // frame membership
  for (const e of live) {
    if (typeof e.frameId !== 'string') continue;
    const f = out.find((x) => x.id === idOf.get(e.frameId as string));
    const id = idOf.get(e.id as string);
    if (f?.type === 'frame' && id && out.some((x) => x.id === id)) f.members.push(id);
  }

  // board sketch = most common roughness; per-element override where different
  const counts = [0, 0, 0];
  for (const r of roughness.values()) counts[r]!++;
  board.sketch = counts.indexOf(Math.max(...counts)) as Sketch;
  for (const el of out) {
    const r = roughness.get(el.id)!;
    if (r !== board.sketch) el.sketch = r;
  }
  board.elements = out;
  return { board, diagnostics };
}
