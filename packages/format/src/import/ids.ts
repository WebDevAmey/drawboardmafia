import { isValidId } from '@dbm/core';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Allocates unique ids for imported elements. */
export class IdAllocator {
  private used = new Set<string>();

  /** Stable anonymous id (`~xxxxxx`) derived from a foreign id. */
  anon(foreign: string): string {
    for (let n = 0; ; n++) {
      const id = '~' + fnv1a(n ? `${foreign}#${n}` : foreign).toString(36).padStart(7, '0').slice(-6);
      if (!this.used.has(id)) return this.take(id);
    }
  }

  /** Readable slug id derived from a foreign id, suffixed on collision. */
  slug(foreign: string): string {
    let s = foreign.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
    if (!/^[a-z]/.test(s)) s = `n${s}`;
    if (!isValidId(s)) s = 'node';
    if (!this.used.has(s)) return this.take(s);
    for (let n = 2; ; n++) if (!this.used.has(`${s}-${n}`)) return this.take(`${s}-${n}`);
  }

  take(id: string): string {
    this.used.add(id);
    return id;
  }

  has(id: string): boolean {
    return this.used.has(id);
  }
}
