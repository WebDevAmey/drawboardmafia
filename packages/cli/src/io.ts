import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface IO {
  cwd: string;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** Max input file size in bytes (default 20 MB). */
  maxBytes?: number;
}

/** Thrown for usage / IO problems; maps to exit code 2. */
export class UsageError extends Error {}

export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export const abs = (io: IO, p: string) => (isAbsolute(p) ? p : resolve(io.cwd, p));

export function readText(io: IO, p: string): string {
  return readBytes(io, p).toString('utf8');
}

export function readBytes(io: IO, p: string): Buffer {
  const full = abs(io, p);
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    throw new UsageError(`cannot read ${p}`);
  }
  const max = io.maxBytes ?? DEFAULT_MAX_BYTES;
  if (size > max) throw new UsageError(`${p} is too large (${size} bytes, limit ${max})`);
  return readFileSync(full);
}

export function writeOut(io: IO, p: string, data: string | Uint8Array) {
  try {
    writeFileSync(abs(io, p), data);
  } catch {
    throw new UsageError(`cannot write ${p}`);
  }
}
