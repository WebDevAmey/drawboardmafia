import { diffBoards, formatChanges, fromExcalidraw, fromMermaid, mergeText, parse, serialize } from '@dbm/format';
import { emptyBoard } from '@dbm/core';
import { readText, writeOut, UsageError, type IO } from '../io';
import { printDiagnostics } from './shared';

export function fmt(io: IO, files: string[], check: boolean): number {
  if (!files.length) throw new UsageError('usage: dbm fmt [--check] <files…>');
  let code = 0;
  for (const f of files) {
    const text = readText(io, f);
    const { board, diagnostics } = parse(text);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length) {
      printDiagnostics(io, f, errors);
      code = 1;
      continue;
    }
    const canon = serialize(board);
    if (canon === text) continue;
    if (check) {
      io.stderr(`${f}: not formatted\n`);
      code = 1;
    } else {
      writeOut(io, f, canon);
      io.stdout(`formatted ${f}\n`);
    }
  }
  return code;
}

export function check(io: IO, files: string[]): number {
  if (!files.length) throw new UsageError('usage: dbm check <files…>');
  let code = 0;
  for (const f of files) {
    const { diagnostics } = parse(readText(io, f));
    printDiagnostics(io, f, diagnostics);
    if (diagnostics.length) code = 1;
  }
  return code;
}

export function merge(io: IO, args: string[]): number {
  const [o, a, b] = args;
  if (!o || !a || !b) throw new UsageError('usage: dbm merge <base> <ours> <theirs>');
  const r = mergeText(readText(io, o), readText(io, a), readText(io, b));
  if (r.diagnostics.length) {
    for (const d of r.diagnostics) io.stderr(`dbm merge: ${d.version}:${d.line}: ${d.message}\n`);
    io.stderr('dbm merge: cannot merge boards with syntax errors; resolve by hand\n');
    return 1;
  }
  for (const c of r.conflicts) {
    io.stderr(`dbm merge: conflict on ${c.id}.${c.prop}: kept ours ${JSON.stringify(c.ours)}, theirs was ${JSON.stringify(c.theirs)}\n`);
  }
  writeOut(io, a, r.text);
  return 0;
}

const loadForDiff = (io: IO, p: string) => (p === '/dev/null' ? emptyBoard() : parse(readText(io, p)).board);

export function diff(io: IO, args: string[]): number {
  if (args.length === 7) {
    // git external diff: path old-file old-hex old-mode new-file new-hex new-mode
    const [path, oldFile, , , newFile] = args as [string, string, string, string, string];
    const lines = formatChanges(diffBoards(loadForDiff(io, oldFile), loadForDiff(io, newFile)));
    io.stdout(`${path}\n${lines.map((l) => `  ${l}\n`).join('')}`);
    return 0;
  }
  const [a, b] = args;
  if (!a || !b || args.length !== 2) throw new UsageError('usage: dbm diff <old> <new>');
  io.stdout(formatChanges(diffBoards(loadForDiff(io, a), loadForDiff(io, b))).map((l) => `${l}\n`).join(''));
  return 0;
}

export function convert(io: IO, kind: 'mermaid' | 'excalidraw', input: string | undefined, output: string | undefined): number {
  if (!input) throw new UsageError(`usage: dbm from-${kind} <file> [-o out.board]`);
  const text = readText(io, input);
  let result;
  if (kind === 'mermaid') result = fromMermaid(text);
  else {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      io.stderr(`${input}: not valid JSON\n`);
      return 1;
    }
    result = fromExcalidraw(json);
  }
  printDiagnostics(io, input, result.diagnostics);
  if (result.diagnostics.some((d) => d.severity === 'error')) return 1;
  const out = serialize(result.board);
  if (output) writeOut(io, output, out);
  else io.stdout(out);
  return 0;
}
