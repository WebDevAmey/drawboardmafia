import { THEMES, resolveColor, type Color, type Dash, type Font, type FontSize, type StrokeWidth } from '@dbm/core';

export type ThemeName = 'light' | 'dark';

export interface Ctx {
  theme: ThemeName;
  stroke: (c: Color) => string;
  fill: (c: Color | 'none') => string;
  canvas: string;
  muted: string;
}

export function makeCtx(theme: ThemeName): Ctx {
  return {
    theme,
    stroke: (c) => resolveColor(c, theme, 'stroke'),
    fill: (c) => (c === 'none' ? 'none' : resolveColor(c, theme, 'fill')),
    canvas: THEMES[theme].canvas,
    muted: THEMES[theme].stroke.gray,
  };
}

export const FONT_FAMILY: Record<Font, string> = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  hand: 'Patrick Hand, Comic Sans MS, cursive',
};

export const FONT_PX: Record<FontSize, number> = { 1: 14, 2: 18, 3: 24, 4: 32 };

export function dashArray(dash: Dash, width: StrokeWidth): string | undefined {
  if (dash === 'dashed') return `${8 + width * 2} ${6 + width * 2}`;
  if (dash === 'dotted') return `0 ${4 + width * 2}`;
  return undefined;
}
