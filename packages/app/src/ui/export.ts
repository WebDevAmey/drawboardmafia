import type { Board } from '@dbm/core';
import { fromExcalidraw, fromMermaid, parse, serialize } from '@dbm/format';
import { renderSvg, type ThemeName } from '@dbm/render';
import { assetUrl } from '../assets';

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportSvg = (board: Board, theme: ThemeName) => {
  const source = serialize(board);
  return renderSvg(board, { theme, source, assets: assetUrl });
};

export async function exportPng(board: Board, theme: ThemeName, scale = 2): Promise<Blob> {
  const svg = exportSvg(board, theme);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(img.width * scale);
  canvas.height = Math.ceil(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

/** Reads a .board, .excalidraw or Mermaid file into a board. */
export async function importFile(file: File): Promise<{ board?: Board; error?: string }> {
  const text = await file.text();
  if (file.name.endsWith('.excalidraw') || file.name.endsWith('.json')) {
    try {
      const r = fromExcalidraw(JSON.parse(text));
      const err = r.diagnostics.find((d) => d.severity === 'error');
      return err ? { error: err.message } : { board: r.board };
    } catch {
      return { error: 'not valid JSON' };
    }
  }
  if (/^\s*(flowchart|graph)\b/.test(text)) {
    const r = fromMermaid(text);
    const err = r.diagnostics.find((d) => d.severity === 'error');
    return err ? { error: err.message } : { board: r.board };
  }
  const r = parse(text);
  const err = r.diagnostics.find((d) => d.severity === 'error');
  return err ? { error: `line ${err.line}: ${err.message}` } : { board: r.board };
}
