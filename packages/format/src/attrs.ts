import { isColor, isValidId, type Element } from '@dbm/core';

/** Canonical attribute order (also the set of all known attributes). */
export const ATTR_ORDER = [
  'icon', 'fill', 'stroke', 'width', 'dash', 'sketch', 'font', 'size', 'align', 'lang',
  'route', 'rot', 'via', 'asset', 'pts', 'locked', 'group',
] as const;
export type AttrKey = (typeof ATTR_ORDER)[number];

const COMMON: AttrKey[] = ['stroke', 'width', 'dash', 'sketch', 'locked', 'group'];
const NODE_COMMON: AttrKey[] = [...COMMON, 'fill', 'rot'];

export const ALLOWED: Record<Element['type'], ReadonlySet<AttrKey>> = {
  box: new Set([...NODE_COMMON, 'font', 'size', 'icon']),
  ellipse: new Set([...NODE_COMMON, 'font', 'size', 'icon']),
  diamond: new Set([...NODE_COMMON, 'font', 'size', 'icon']),
  cylinder: new Set([...NODE_COMMON, 'font', 'size', 'icon']),
  text: new Set([...NODE_COMMON, 'font', 'size', 'align']),
  note: new Set([...NODE_COMMON, 'font', 'size', 'align']),
  code: new Set([...NODE_COMMON, 'lang']),
  frame: new Set(NODE_COMMON),
  image: new Set([...NODE_COMMON, 'asset']),
  ink: new Set([...COMMON, 'rot', 'pts']),
  arrow: new Set([...COMMON, 'route', 'via']),
};

const ASSET_RE = /^[a-f0-9]{64}\.(png|jpe?g|gif|webp)$/;
const ICON_RE = /^[a-z][a-z0-9-]{0,23}$/;
const LANG_RE = /^[a-z0-9+#-]{1,24}$/;
const oneOf = <T extends string | number>(vals: readonly T[], raw: string): T | undefined =>
  vals.find((v) => String(v) === raw);

/** Parses one attribute value. Returns undefined when invalid. `pts` is handled by the caller. */
export function parseAttrValue(key: AttrKey, raw: string): unknown {
  switch (key) {
    case 'fill':
      return raw === 'none' || isColor(raw) ? raw : undefined;
    case 'stroke':
      return isColor(raw) ? raw : undefined;
    case 'width':
      return oneOf([1, 2, 4] as const, raw);
    case 'dash':
      return oneOf(['solid', 'dashed', 'dotted'] as const, raw);
    case 'sketch':
      return oneOf([0, 1, 2] as const, raw);
    case 'font':
      return oneOf(['sans', 'mono', 'hand'] as const, raw);
    case 'size':
      return oneOf([1, 2, 3, 4] as const, raw);
    case 'align':
      return oneOf(['l', 'c', 'r'] as const, raw);
    case 'icon':
      return ICON_RE.test(raw) ? raw : undefined;
    case 'lang':
      return LANG_RE.test(raw) ? raw : undefined;
    case 'route':
      return oneOf(['straight', 'elbow', 'curve'] as const, raw);
    case 'rot': {
      if (!/^-?\d+(\.\d)?$/.test(raw)) return undefined;
      const n = Number(raw);
      return n > -360 && n < 360 ? n : undefined;
    }
    case 'via': {
      const pts = raw.split(';').map((p) => p.split(','));
      if (!pts.every((p) => p.length === 2 && p.every((n) => /^-?\d+$/.test(n)))) return undefined;
      return pts.map(([x, y]) => [Number(x), Number(y)]);
    }
    case 'asset':
      return ASSET_RE.test(raw) ? raw : undefined;
    case 'locked':
      return raw === 'true' ? true : undefined;
    case 'group':
      return isValidId(raw) ? raw : undefined;
    case 'pts':
      return raw;
  }
}
