const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

export const num = (n: number): string => String(Math.round(n * 100) / 100);

/** Builds an element string; attribute values are always escaped; undefined attrs are skipped. */
export function tag(name: string, attrs: Record<string, string | number | undefined>, children?: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(typeof v === 'number' ? num(v) : v!)}"`)
    .join('');
  return children === undefined ? `<${name}${a}/>` : `<${name}${a}>${children}</${name}>`;
}
