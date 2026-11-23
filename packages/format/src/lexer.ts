export type TokenKind =
  | 'ident' // id or keyword: api, api-2, ~a8f3kq, box
  | 'string' // "..." → value: string
  | 'pos' // @x,y → value: [x, y]
  | 'size' // WxH → value: [w, h]
  | 'point' // (x,y) free connector end → value: [x, y]
  | 'colon'
  | 'op' // -> <-> --
  | 'lbrace'
  | 'rbrace'
  | 'attr'; // key=value → value: [key, value]

export interface Token {
  kind: TokenKind;
  text: string;
  col: number;
  value?: unknown;
}

export interface LexError {
  col: number;
  message: string;
}

const IDENT = /[a-z~][a-z0-9_]*(?:-[a-z0-9_]+)*/y;
const POS = /@(-?\d+),(-?\d+)/y;
const SIZE = /(\d+)x(\d+)(?![a-z0-9_])/y;
const POINT = /\((-?\d+),(-?\d+)\)/y;
const OP = /<->|->|--/y;
const ATTR_KEY = /([a-z]+)=/y;
const BARE = /[^\s"{}()]+/y;

function match(re: RegExp, src: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(src);
}

/** Reads a double-quoted string starting at `at` (which must be `"`). */
function readString(src: string, at: number): { value: string; end: number } | null {
  let out = '';
  let i = at + 1;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"') return { value: out, end: i + 1 };
    if (c === '\\') {
      const n = src[i + 1];
      if (n === 'n') out += '\n';
      else if (n === '"' || n === '\\') out += n;
      else return null;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return null;
}

export function lexLine(src: string): { tokens: Token[]; error?: LexError } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    const col = i;
    const push = (kind: TokenKind, end: number, value?: unknown) => {
      tokens.push({ kind, text: src.slice(col, end), col, value });
      i = end;
    };
    let m: RegExpExecArray | null;
    if (c === '"') {
      const s = readString(src, i);
      if (!s) return { tokens, error: { col, message: 'unterminated string' } };
      push('string', s.end, s.value);
    } else if (c === ':') push('colon', i + 1);
    else if (c === '{') push('lbrace', i + 1);
    else if (c === '}') push('rbrace', i + 1);
    else if ((m = match(OP, src, i))) push('op', i + m[0].length);
    else if ((m = match(POS, src, i))) push('pos', i + m[0].length, [Number(m[1]), Number(m[2])]);
    else if ((m = match(POINT, src, i))) push('point', i + m[0].length, [Number(m[1]), Number(m[2])]);
    else if ((m = match(SIZE, src, i))) push('size', i + m[0].length, [Number(m[1]), Number(m[2])]);
    else if ((m = match(ATTR_KEY, src, i))) {
      const key = m[1]!;
      const vAt = i + m[0].length;
      if (src[vAt] === '"') {
        const s = readString(src, vAt);
        if (!s) return { tokens, error: { col: vAt, message: 'unterminated string' } };
        push('attr', s.end, [key, s.value]);
      } else {
        const b = match(BARE, src, vAt);
        push('attr', vAt + (b ? b[0].length : 0), [key, b ? b[0] : '']);
      }
    } else if ((m = match(IDENT, src, i))) push('ident', i + m[0].length);
    else return { tokens, error: { col, message: `unexpected '${c}'` } };
  }
  return { tokens };
}
