/**
 * Images are content-addressed (`<sha256>.<ext>`, as the .board format expects), cached in memory
 * as data URLs + decoded images, and persisted in IndexedDB.
 */
import { getAsset, putAsset } from './persist';

const MAX_DIM = 2048;
const MAX_BYTES = 1.5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

const urls = new Map<string, string>();
const images = new Map<string, HTMLImageElement>();
const pending = new Set<string>();
let onLoad: () => void = () => {};
export const onAssetLoaded = (cb: () => void) => (onLoad = cb);

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
const decode = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

/** Registers an asset (from a local file or a collaborator). */
export function addAsset(name: string, dataUrl: string, persist = true) {
  if (urls.has(name)) return;
  urls.set(name, dataUrl);
  decode(dataUrl).then((img) => {
    images.set(name, img);
    onLoad();
  }, () => {});
  if (persist) putAsset(name, dataUrl).catch(() => {});
}

export const assetUrl = (name: string) => urls.get(name);
export const hasAsset = (name: string) => urls.has(name);

/** Decoded image for the renderer; starts loading from IndexedDB on first request. */
export function assetImage(name: string): HTMLImageElement | undefined {
  const img = images.get(name);
  if (img || pending.has(name) || urls.has(name)) return img;
  pending.add(name);
  getAsset(name).then((url) => url && addAsset(name, url, false)).finally(() => pending.delete(name));
  return undefined;
}

/** Reads an image file, downscaling large ones, and returns its content-addressed asset. */
export async function importImage(file: Blob): Promise<{ name: string; width: number; height: number }> {
  if (!EXT[file.type]) throw new Error('Use a PNG, JPEG, GIF or WebP image');
  let blob: Blob = file;
  let img = await decode(await readAsDataUrl(file));
  if (img.naturalWidth > MAX_DIM || img.naturalHeight > MAX_DIM || file.size > MAX_BYTES) {
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/webp', 0.9));
  }
  const url = await readAsDataUrl(blob);
  img = await decode(url);
  const name = `${hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))}.${EXT[blob.type] ?? 'png'}`;
  addAsset(name, url);
  return { name, width: img.naturalWidth, height: img.naturalHeight };
}
