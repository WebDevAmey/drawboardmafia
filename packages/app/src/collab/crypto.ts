/** End-to-end encryption for live sessions. The key lives only in the URL fragment. */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64Url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** A fresh room id (128-bit) and AES-GCM-128 key, both base64url. */
export function newRoom(): { room: string; key: string } {
  return { room: toB64Url(random(16)), key: toB64Url(random(16)) };
}

export const importKey = (key: string) =>
  crypto.subtle.importKey('raw', fromB64Url(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toB64Url(out);
}

export async function open<T>(key: CryptoKey, data: string): Promise<T> {
  const bytes = fromB64Url(data);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
  return JSON.parse(dec.decode(pt)) as T;
}

/** `#live=<room>.<key>` */
export function parseHash(hash: string): { room: string; key: string } | undefined {
  const m = /[#&]live=([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{22})/.exec(hash);
  return m ? { room: m[1]!, key: m[2]! } : undefined;
}
export const shareUrl = (room: string, key: string) => `${location.origin}${location.pathname}#live=${room}.${key}`;
