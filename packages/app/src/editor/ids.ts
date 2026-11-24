import { isValidId, type Board } from '@dbm/core';

const taken = (board: Board) => new Set(board.elements.map((e) => e.id));

/** Fresh anonymous id (`~` + 6 base36 chars) not used in the board. */
export function newId(board: Board, extra: Set<string> = new Set()): string {
  const used = taken(board);
  for (;;) {
    let s = '~';
    for (let i = 0; i < 6; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)];
    if (!used.has(s) && !extra.has(s)) return s;
  }
}

/** Readable id from a label ("API Gateway" → "api-gateway"), unique in the board. */
export function slugId(label: string, board: Board, extra: Set<string> = new Set()): string | undefined {
  let s = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
  if (!s) return undefined;
  if (!/^[a-z]/.test(s)) s = `n${s}`;
  if (!isValidId(s)) return undefined;
  const used = taken(board);
  if (!used.has(s) && !extra.has(s)) return s;
  for (let n = 2; ; n++) if (!used.has(`${s}-${n}`) && !extra.has(`${s}-${n}`)) return `${s}-${n}`;
}
