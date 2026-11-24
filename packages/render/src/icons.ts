/**
 * Original pictograms for architecture diagrams, drawn on a 24×24 grid as stroke-only paths.
 * Shared by the canvas renderer, the SVG exporter and the library panel.
 */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`;
const dot = (x: number, y: number) => `M${x} ${y}h.01`;

export interface IconDef {
  label: string;
  /** search terms */
  tags: string;
  d: string;
}

export const ICONS: Record<string, IconDef> = {
  server: { label: 'Server', tags: 'compute host vm machine instance', d: `${rr(3, 3, 18, 8, 2)} ${rr(3, 13, 18, 8, 2)} ${dot(7, 7)} ${dot(7, 17)}` },
  database: { label: 'Database', tags: 'db sql postgres mysql storage table', d: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  cache: { label: 'Cache', tags: 'redis memcached fast memory', d: 'M13 2 4 14h7l-1 8 9-12h-7z' },
  queue: { label: 'Queue', tags: 'sqs rabbitmq kafka message broker fifo', d: `${rr(2, 7, 20, 10, 2)} M7 7v10 M12 7v10 M17 7v10` },
  stream: { label: 'Stream', tags: 'events kafka kinesis pubsub topic', d: 'M3 8c2.5-2.5 4.5-2.5 6 0s3.5 2.5 6 0 3.5-2.5 6 0 M3 16c2.5-2.5 4.5-2.5 6 0s3.5 2.5 6 0 3.5-2.5 6 0' },
  'load-balancer': { label: 'Load balancer', tags: 'lb proxy nginx haproxy traffic distribute', d: `${circle(12, 5, 2.5)} M12 7.5V12 M12 12 5 17 M12 12v5 M12 12l7 5 ${circle(5, 19, 2)} ${circle(12, 19, 2)} ${circle(19, 19, 2)}` },
  api: { label: 'API', tags: 'rest graphql endpoint interface service', d: 'M8 4C6 4 5 5 5 7v2c0 1.2-.8 2.4-2 3 1.2.6 2 1.8 2 3v2c0 2 1 3 3 3 M16 4c2 0 3 1 3 3v2c0 1.2.8 2.4 2 3-1.2.6-2 1.8-2 3v2c0 2-1 3-3 3' },
  gateway: { label: 'API gateway', tags: 'ingress edge entry router', d: `${rr(3, 3, 18, 18, 3)} M8 12h8 M13 8.5 16.5 12 13 15.5` },
  service: { label: 'Service', tags: 'microservice backend app module', d: 'M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z' },
  function: { label: 'Function', tags: 'lambda serverless faas cloud function', d: 'M7 4h3l7 16 M11.5 10.5 7 20' },
  container: { label: 'Container', tags: 'docker pod kubernetes image', d: 'M12 3 20 7.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12 4 7.5' },
  worker: { label: 'Worker', tags: 'job background process gear task', d: `${circle(12, 12, 3)} ${circle(12, 12, 7.5)} M12 1.5v3 M12 19.5v3 M1.5 12h3 M19.5 12h3` },
  cron: { label: 'Scheduler', tags: 'cron timer clock schedule batch', d: `${circle(12, 12, 9)} M12 7v5l3.5 2` },
  client: { label: 'Web client', tags: 'browser frontend spa website ui', d: `${rr(2, 4, 20, 16, 2)} M2 9h20 ${dot(5.5, 6.5)} ${dot(8, 6.5)}` },
  mobile: { label: 'Mobile app', tags: 'phone ios android device', d: `${rr(7, 2, 10, 20, 2.5)} M11 18h2` },
  user: { label: 'User', tags: 'person actor customer human', d: `${circle(12, 8, 4)} M4 21c0-4 3.6-6 8-6s8 2 8 6` },
  cloud: { label: 'Cloud', tags: 'aws gcp azure provider internet saas', d: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.5 10a4.5 4.5 0 0 0 1.5 9z' },
  cdn: { label: 'CDN', tags: 'edge cache cloudfront global content delivery globe internet', d: `${circle(12, 12, 9)} M3 12h18 M12 3c3 3.2 3 14.8 0 18 M12 3c-3 3.2-3 14.8 0 18` },
  dns: { label: 'DNS', tags: 'domain name route53 resolve', d: 'M12 2v20 M12 5h6.5l2 2.5-2 2.5H12 M12 12H5.5l-2 2.5 2 2.5H12' },
  network: { label: 'Network', tags: 'vpc subnet router switch topology', d: `${circle(12, 5, 2.5)} ${circle(5, 19, 2.5)} ${circle(19, 19, 2.5)} M10.8 7.2 6.2 16.8 M13.2 7.2l4.6 9.6 M7.5 19h9` },
  firewall: { label: 'Firewall', tags: 'security waf wall block', d: `${rr(3, 4, 18, 16, 1.5)} M3 9.3h18 M3 14.7h18 M9 4v5.3 M15 9.3v5.4 M9 14.7V20` },
  auth: { label: 'Auth', tags: 'login identity oauth sso lock security', d: `${rr(5, 11, 14, 10, 2)} M8 11V8a4 4 0 0 1 8 0v3 M12 15v2` },
  shield: { label: 'Security', tags: 'vpn shield protect policy', d: 'M12 3l8 3v6c0 4.9-3.4 8-8 9-4.6-1-8-4.1-8-9V6z' },
  storage: { label: 'Object storage', tags: 's3 bucket blob files gcs', d: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6l2 13c.3 1.2 2.9 2 6 2s5.7-.8 6-2l2-13' },
  search: { label: 'Search', tags: 'elasticsearch index query lookup', d: `${circle(10.5, 10.5, 6.5)} M20 20l-4.8-4.8` },
  monitoring: { label: 'Monitoring', tags: 'metrics observability grafana dashboard chart', d: 'M3 3v18h18 M7 15l4-4 3 3 5-6' },
  logs: { label: 'Logs', tags: 'logging file document audit trace', d: 'M6 2h9l5 5v15H6z M15 2v5h5 M9 12h7 M9 16h7' },
  analytics: { label: 'Analytics', tags: 'warehouse bi reporting olap bigquery snowflake', d: 'M5 20V11 M12 20V4 M19 20v-7' },
  notification: { label: 'Notification', tags: 'push alert bell sns', d: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4' },
  email: { label: 'Email', tags: 'mail smtp ses inbox', d: `${rr(3, 5, 18, 14, 2)} M3 7.5l9 6 9-6` },
  payment: { label: 'Payments', tags: 'stripe billing card checkout', d: `${rr(2, 5, 20, 14, 2)} M2 10h20 M6 15h4` },
  ml: { label: 'ML model', tags: 'ai llm inference gpu chip model', d: `${rr(6, 6, 12, 12, 2)} M9.5 2v4 M14.5 2v4 M9.5 18v4 M14.5 18v4 M2 9.5h4 M2 14.5h4 M18 9.5h4 M18 14.5h4` },
};

export const iconNames = () => Object.keys(ICONS);

/** Icon + label vertical layout inside a node box. */
export function iconLayout(w: number, h: number, hasLabel: boolean, labelHeight: number) {
  const size = hasLabel ? Math.max(16, Math.min(40, Math.min(w, h) * 0.36)) : Math.max(16, Math.min(w, h) * 0.5);
  const gap = hasLabel ? 6 : 0;
  const total = size + gap + (hasLabel ? labelHeight : 0);
  return { size, iconTop: -total / 2, labelTop: -total / 2 + size + gap };
}
