/**
 * Wire protocol (JSON text frames). `data` is always ciphertext (base64 of iv+AES-GCM payload);
 * the relay never sees board content, chat text or names.
 */
export type Logged = 'op' | 'chat' | 'asset' | 'snapshot';

export type ClientMsg =
  | { type: 'op' | 'chat' | 'asset'; data: string }
  | { type: 'presence'; data: string }
  /** Replaces logged ops up to and including `seq` (chat and assets are kept). */
  | { type: 'snapshot'; seq: number; data: string };

export interface Entry {
  type: Logged;
  seq: number;
  from: string;
  data: string;
}

export type ServerMsg =
  | { type: 'welcome'; id: string; peers: string[]; log: Entry[] }
  | ({ type: 'op' | 'chat' | 'asset' } & Entry)
  | { type: 'presence'; from: string; data: string }
  | { type: 'join' | 'leave'; id: string }
  | { type: 'need-snapshot'; seq: number }
  | { type: 'error'; message: string };

export const ROOM_RE = /^[A-Za-z0-9_-]{16,64}$/;
