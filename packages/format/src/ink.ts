import type { InkPoint } from '@dbm/core';

// Layout: [flags][count varint] then per point: zigzag-varint dx, dy (+ pressure byte if flag bit 0).
// Encoded as base64url without padding. Coordinates are rounded to integers.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INV = new Map([...B64].map((c, i) => [c, i]));

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

function fromBase64Url(s: string): number[] {
  if (s.length % 4 === 1) throw new Error('invalid ink data');
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? B64_INV.get(chunk[k]!) : 0;
      if (v === undefined) throw new Error('invalid ink data');
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return bytes;
}

const zigzag = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzigzag = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function writeVarint(out: number[], n: number) {
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

const DEFAULT_PRESSURE = 0.5;

export function encodeInk(pts: InkPoint[]): string {
  const hasPressure = pts.some((p) => p[2] !== DEFAULT_PRESSURE);
  const out: number[] = [hasPressure ? 1 : 0];
  writeVarint(out, pts.length);
  let px = 0;
  let py = 0;
  for (const [x, y, p] of pts) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    writeVarint(out, zigzag(rx - px));
    writeVarint(out, zigzag(ry - py));
    px = rx;
    py = ry;
    if (hasPressure) out.push(Math.max(0, Math.min(255, Math.round(p * 255))));
  }
  return toBase64Url(out);
}

export function decodeInk(s: string): InkPoint[] {
  const bytes = fromBase64Url(s);
  let i = 0;
  const next = () => {
    if (i >= bytes.length) throw new Error('invalid ink data');
    return bytes[i++]!;
  };
  const readVarint = () => {
    let n = 0;
    let mul = 1;
    for (;;) {
      const b = next();
      n += (b & 127) * mul;
      if (b < 128) return n;
      mul *= 128;
      if (mul > 2 ** 35) throw new Error('invalid ink data');
    }
  };
  const flags = next();
  if (flags > 1) throw new Error('invalid ink data');
  const count = readVarint();
  const pts: InkPoint[] = [];
  let x = 0;
  let y = 0;
  for (let k = 0; k < count; k++) {
    x += unzigzag(readVarint());
    y += unzigzag(readVarint());
    const p = flags & 1 ? next() / 255 : DEFAULT_PRESSURE;
    pts.push([x, y, p]);
  }
  if (i !== bytes.length) throw new Error('invalid ink data');
  return pts;
}
