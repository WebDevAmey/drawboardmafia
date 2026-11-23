export const PALETTE_TOKENS = ['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'] as const;
export type PaletteToken = (typeof PALETTE_TOKENS)[number];
export type Color = PaletteToken | `#${string}`;

const HEX_RE = /^#[0-9a-f]{6}$/;

export function isColor(s: string): s is Color {
  return (PALETTE_TOKENS as readonly string[]).includes(s) || HEX_RE.test(s);
}

/** Resolved colors per theme. Stroke and fill variants are tuned separately for comfort. */
export interface ThemeColors {
  canvas: string;
  stroke: Record<PaletteToken, string>;
  fill: Record<PaletteToken, string>;
}

export const THEMES: Record<'light' | 'dark', ThemeColors> = {
  light: {
    canvas: '#fbfbfa',
    stroke: {
      ink: '#1e1e1e', gray: '#6b6f76', red: '#d63c3c', orange: '#d9730d', yellow: '#c29a00',
      green: '#2f9e44', blue: '#1c7ed6', violet: '#7048e8',
    },
    fill: {
      ink: '#e9e9e7', gray: '#f1f1ef', red: '#ffe3e3', orange: '#ffe8cc', yellow: '#fff3bf',
      green: '#d3f9d8', blue: '#d0ebff', violet: '#e5dbff',
    },
  },
  dark: {
    canvas: '#16171a',
    stroke: {
      ink: '#e4e4e2', gray: '#9a9ea6', red: '#ff8787', orange: '#ffa94d', yellow: '#ffd43b',
      green: '#69db7c', blue: '#74c0fc', violet: '#b197fc',
    },
    fill: {
      ink: '#2b2d31', gray: '#26282c', red: '#4a2326', orange: '#4a3220', yellow: '#463d1c',
      green: '#1f3a26', blue: '#1b3247', violet: '#2f2648',
    },
  },
};

export function resolveColor(c: Color, theme: 'light' | 'dark', role: 'stroke' | 'fill'): string {
  return c.startsWith('#') ? c : THEMES[theme][role][c as PaletteToken];
}
