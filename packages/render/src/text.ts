import type { Align, Font } from '@dbm/core';
import { FONT_FAMILY } from './theme';
import { tag, esc } from './xml';

export const LINE_HEIGHT = 1.25;
const CHAR_EM: Record<Font, number> = { sans: 0.56, mono: 0.6, hand: 0.55 };

/** Approximate text metrics shared by the SVG and (later) canvas exporters. */
export function measure(text: string, px: number, font: Font = 'sans') {
  const lines = text.split('\n');
  const width = Math.max(0, ...lines.map((l) => [...l].length)) * px * CHAR_EM[font];
  return { lines, width, height: lines.length * px * LINE_HEIGHT };
}

export interface TextOpts {
  x: number; // anchor x (left, center or right depending on align)
  y: number; // top of the first line
  px: number;
  font: Font;
  align: Align;
  color: string;
  preserve?: boolean;
}

export function textSvg(text: string, o: TextOpts): string {
  if (text === '') return '';
  const anchor = o.align === 'c' ? 'middle' : o.align === 'r' ? 'end' : 'start';
  const lh = o.px * LINE_HEIGHT;
  const spans = text
    .split('\n')
    .map((line, i) => tag('tspan', { x: o.x, y: o.y + i * lh + o.px * 0.95 }, esc(line)))
    .join('');
  return tag(
    'text',
    {
      'font-family': FONT_FAMILY[o.font],
      'font-size': o.px,
      fill: o.color,
      'text-anchor': anchor,
      'xml:space': o.preserve ? 'preserve' : undefined,
    },
    spans,
  );
}

/** Text centered inside a box (shape labels). */
export function centeredText(text: string, cx: number, cy: number, px: number, font: Font, color: string): string {
  const { height } = measure(text, px, font);
  return textSvg(text, { x: cx, y: cy - height / 2, px, font, align: 'c', color });
}
