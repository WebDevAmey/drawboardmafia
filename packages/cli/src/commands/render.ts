import { existsSync } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { parse } from '@dbm/format';
import { renderSvg } from '@dbm/render';
import { Resvg } from '@resvg/resvg-js';
import { abs, readBytes, readText, writeOut, UsageError, type IO } from '../io';
import { printDiagnostics } from './shared';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

export function render(io: IO, file: string | undefined, o: { output?: string; theme?: string; frame?: string; scale?: string; padding?: string }): number {
  if (!file) throw new UsageError('usage: dbm render <file> [-o out.svg|out.png] [--theme light|dark] [--frame id]');
  const theme = o.theme ?? 'light';
  if (theme !== 'light' && theme !== 'dark') throw new UsageError('--theme must be light or dark');
  const ext = o.output ? extname(o.output).toLowerCase() : '.svg';
  if (ext !== '.svg' && ext !== '.png') throw new UsageError('output must end in .svg or .png');
  const scale = o.scale === undefined ? 2 : Number(o.scale);
  const padding = o.padding === undefined ? undefined : Number(o.padding);
  if (!(scale > 0 && scale <= 8)) throw new UsageError('--scale must be between 0 and 8');
  if (padding !== undefined && !(padding >= 0)) throw new UsageError('--padding must be >= 0');

  const source = readText(io, file);
  const { board, diagnostics } = parse(source);
  printDiagnostics(io, file, diagnostics);
  const assetDir = join(dirname(abs(io, file)), `${basename(file)}.assets`);
  const assets = (name: string) => {
    // names are validated by the parser (sha256 + known extension), so they cannot escape assetDir
    const path = join(assetDir, name);
    if (!existsSync(path)) return undefined;
    return `data:${MIME[extname(name)] ?? 'application/octet-stream'};base64,${readBytes(io, path).toString('base64')}`;
  };
  let svg: string;
  try {
    svg = renderSvg(board, { theme, frame: o.frame, assets, source, padding });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  if (!o.output) io.stdout(svg);
  else if (ext === '.svg') writeOut(io, o.output, svg);
  else {
    const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: true } }).render().asPng();
    writeOut(io, o.output, png);
  }
  return diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}
