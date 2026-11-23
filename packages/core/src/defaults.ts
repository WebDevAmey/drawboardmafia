import type { NodeType, Style } from './schema';

export const STYLE_DEFAULTS: Pick<Style, 'stroke' | 'fill' | 'width' | 'dash'> = {
  stroke: 'ink',
  fill: 'none',
  width: 2,
  dash: 'solid',
};

/** Per-type fill default (notes and code blocks are filled). */
export const FILL_DEFAULTS: Partial<Record<NodeType, Style['fill']>> = {
  note: 'yellow',
  code: 'gray',
};

const SIZES: Record<NodeType, { w: number; h: number }> = {
  box: { w: 160, h: 80 },
  ellipse: { w: 160, h: 80 },
  diamond: { w: 160, h: 100 },
  cylinder: { w: 120, h: 100 },
  text: { w: 160, h: 40 },
  note: { w: 200, h: 200 },
  code: { w: 320, h: 160 },
  frame: { w: 400, h: 300 },
  image: { w: 200, h: 200 },
  ink: { w: 0, h: 0 },
};

export const defaultSize = (type: NodeType): { w: number; h: number } => ({ ...SIZES[type] });
export const defaultFill = (type: NodeType): Style['fill'] => FILL_DEFAULTS[type] ?? STYLE_DEFAULTS.fill;
