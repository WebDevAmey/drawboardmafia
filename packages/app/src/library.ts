import { STYLE_DEFAULTS, defaultSize, type Element } from '@dbm/core';
import { ICONS } from '@dbm/render';

export const LIBRARY_MIME = 'application/x-dbm-library';

export interface LibraryItem {
  id: string;
  name: string;
  category: string;
  /** icon drawn in the panel (a key of ICONS, or a built-in shape preview) */
  preview: string;
  keywords: string;
  make: () => Element[];
}

const base = { rot: 0, ...STYLE_DEFAULTS };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A labelled box carrying an architecture icon. */
const iconBox = (icon: string, category: string, name = ICONS[icon]!.label, extra = ''): LibraryItem => ({
  id: icon,
  name,
  category,
  preview: icon,
  keywords: `${name} ${ICONS[icon]!.tags} ${extra}`.toLowerCase(),
  make: () => [{ ...base, id: slug(name), type: 'box', label: name, icon, x: 0, y: 0, w: 140, h: 100 } as Element],
});

export const CATEGORIES = ['Clients', 'Edge & network', 'Compute', 'Data', 'Messaging', 'Security & ops', 'Structure'] as const;

export const LIBRARY: LibraryItem[] = [
  iconBox('user', 'Clients'),
  iconBox('client', 'Clients'),
  iconBox('mobile', 'Clients'),
  iconBox('dns', 'Edge & network'),
  iconBox('cdn', 'Edge & network'),
  iconBox('load-balancer', 'Edge & network'),
  iconBox('gateway', 'Edge & network'),
  iconBox('firewall', 'Edge & network'),
  iconBox('network', 'Edge & network'),
  iconBox('cloud', 'Edge & network'),
  iconBox('server', 'Compute'),
  iconBox('service', 'Compute'),
  iconBox('api', 'Compute'),
  iconBox('container', 'Compute'),
  iconBox('function', 'Compute'),
  iconBox('worker', 'Compute'),
  iconBox('cron', 'Compute'),
  iconBox('ml', 'Compute'),
  {
    id: 'database', name: 'Database', category: 'Data', preview: 'database', keywords: `database ${ICONS.database!.tags}`,
    make: () => [{ ...base, id: 'database', type: 'cylinder', label: 'Database', x: 0, y: 0, w: 120, h: 110 } as Element],
  },
  iconBox('cache', 'Data'),
  iconBox('storage', 'Data'),
  iconBox('search', 'Data'),
  iconBox('analytics', 'Data'),
  iconBox('queue', 'Messaging'),
  iconBox('stream', 'Messaging'),
  iconBox('notification', 'Messaging'),
  iconBox('email', 'Messaging'),
  iconBox('auth', 'Security & ops'),
  iconBox('shield', 'Security & ops'),
  iconBox('monitoring', 'Security & ops'),
  iconBox('logs', 'Security & ops'),
  iconBox('payment', 'Security & ops'),
  {
    id: 'boundary', name: 'Boundary', category: 'Structure', preview: 'shape:frame', keywords: 'boundary vpc region zone cluster group frame',
    make: () => [{ ...base, id: 'boundary', type: 'frame', name: 'VPC', members: [], x: 0, y: 0, w: 480, h: 320 } as Element],
  },
  {
    id: 'decision', name: 'Decision', category: 'Structure', preview: 'shape:diamond', keywords: 'decision condition branch if diamond',
    make: () => [{ ...base, id: 'decision', type: 'diamond', label: 'Decision?', x: 0, y: 0, ...defaultSize('diamond') } as Element],
  },
  {
    id: 'note', name: 'Note', category: 'Structure', preview: 'shape:note', keywords: 'note sticky comment annotation',
    make: () => [{ ...base, id: 'note', type: 'note', text: 'Note', fill: 'yellow', x: 0, y: 0, w: 200, h: 140 } as Element],
  },
  {
    id: 'flow', name: 'Request flow', category: 'Structure', preview: 'shape:flow', keywords: 'flow pattern client server database three tier template',
    make: () => [
      { ...base, id: 'client', type: 'box', label: 'Client', icon: 'client', x: 0, y: 0, w: 140, h: 100 },
      { ...base, id: 'api', type: 'box', label: 'API', icon: 'api', x: 220, y: 0, w: 140, h: 100 },
      { ...base, id: 'database', type: 'cylinder', label: 'Database', x: 440, y: -5, w: 120, h: 110 },
      { ...base, id: 'client-api', type: 'arrow', from: { id: 'client' }, to: { id: 'api' }, head: 'end', route: 'straight' },
      { ...base, id: 'api-database', type: 'arrow', from: { id: 'api' }, to: { id: 'database' }, head: 'end', route: 'straight' },
    ] as Element[],
  },
];

export function searchLibrary(q: string): LibraryItem[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return LIBRARY;
  return LIBRARY.filter((i) => terms.every((t) => i.keywords.includes(t) || i.name.toLowerCase().includes(t)));
}
