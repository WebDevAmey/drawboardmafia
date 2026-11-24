// End-to-end check of the running app (pnpm dev) with two real browser pages.
// Usage: node e2e/collab.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:5191/';
const out = process.argv[2] ?? 'e2e/shots';
mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const a = await ctxA.newPage();
const b = await ctxB.newPage();
const errors = [];
for (const [n, p] of [['A', a], ['B', b]]) p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`));

const ed = (p, fn, arg) => p.evaluate(fn, arg);
const elements = (p) => ed(p, () => window.__dbm.board.elements.map((e) => ({ id: e.id, type: e.type, x: e.x, label: e.label, text: e.text, icon: e.icon })));
const waitFor = async (p, pred, arg, ms = 5000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await p.evaluate(pred, arg)) return true;
    await p.waitForTimeout(50);
  }
  return false;
};

// ---- A: fresh board, white canvas
await a.goto(APP);
await a.waitForFunction(() => window.__dbm && window.__dbm.board.elements.length > 0); // initial load done
await ed(a, () => {
  localStorage.clear();
  window.__dbm.store.replace({ version: 1, sketch: 0, elements: [], trailingComments: [] });
  window.__dbm.setCamera({ x: 0, y: 0, zoom: 1 });
});
check('white canvas', (await ed(a, () => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');

// ---- tools: rectangle via keyboard + mouse drag
await a.mouse.move(640, 400);
await a.keyboard.press('r');
await a.mouse.move(300, 300);
await a.mouse.down();
await a.mouse.move(400, 350, { steps: 5 });
await a.mouse.move(460, 380, { steps: 5 });
await a.mouse.up();
let els = await elements(a);
check('rectangle tool', els.length === 1 && els[0].type === 'box');

// line tool
await a.keyboard.press('l');
await a.mouse.move(600, 300);
await a.mouse.down();
await a.mouse.move(800, 320, { steps: 6 });
await a.mouse.up();
els = await elements(a);
check('line tool', els.length === 2 && (await ed(a, () => window.__dbm.board.elements[1].head)) === 'none');

// ---- library: open, search, drag onto canvas
await a.keyboard.press('Escape');
await a.keyboard.press('b');
await a.waitForSelector('.library');
await a.fill('.library input', 'load');
await a.dragAndDrop('.lib-item:has-text("Load balancer")', '.canvas-host', { targetPosition: { x: 400, y: 600 } });
await a.waitForTimeout(100);
els = await elements(a);
const lb = els.find((e) => e.icon === 'load-balancer');
check('library drag & drop', !!lb, lb?.id);
await a.fill('.library input', '');
await a.click('.lib-item:has-text("Database")');
els = await elements(a);
check('library click to insert', els.some((e) => e.type === 'cylinder' && e.label === 'Database'));
await a.screenshot({ path: `${out}/1-library.png` });
await a.keyboard.press('Escape');

// ---- image: insert a generated PNG via the file input
const { Resvg } = await import('@resvg/resvg-js');
const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" rx="12" fill="#2f6bff"/><circle cx="50" cy="50" r="28" fill="#ffd43b"/></svg>').render().asPng();
await a.setInputFiles('input[type=file][accept^="image"]', { name: 'chart.png', mimeType: 'image/png', buffer: png });
await waitFor(a, () => window.__dbm.board.elements.some((e) => e.type === 'image'));
const img = await ed(a, () => window.__dbm.board.elements.find((e) => e.type === 'image'));
check('image insert', !!img && /^[a-f0-9]{64}\.png$/.test(img.asset), img ? `${img.w}x${img.h}` : '');
await a.waitForTimeout(150);
const pixel = async (p, el) => p.evaluate(({ x, y }) => {
  const c = document.querySelectorAll('canvas')[0];
  const s = window.__dbm.toScreen({ x, y });
  const d = c.getContext('2d').getImageData(Math.round(s.x * devicePixelRatio), Math.round(s.y * devicePixelRatio), 1, 1).data;
  return [d[0], d[1], d[2]];
}, { x: el.x + 10, y: el.y + 10 });
const px = await pixel(a, img);
check('image is drawn on the canvas', px[2] > 200 && px[0] < 120, `rgb(${px})`);
// resize keeps aspect ratio
await a.keyboard.press('v');
const r0 = await ed(a, () => window.__dbm.board.elements.find((e) => e.type === 'image'));
const se = await ed(a, (r) => window.__dbm.toScreen({ x: r.x + r.w, y: r.y + r.h }), r0);
await a.mouse.move(se.x, se.y);
await a.mouse.down();
await a.mouse.move(se.x + 80, se.y + 10, { steps: 6 });
await a.mouse.up();
const r1 = await ed(a, () => window.__dbm.board.elements.find((e) => e.type === 'image'));
check('image resize keeps aspect', r1.w > r0.w && Math.abs(r1.w / r1.h - r0.w / r0.h) < 0.03, `${r0.w}x${r0.h} → ${r1.w}x${r1.h}`);
// move
await a.mouse.move(se.x - 20, se.y - 20);
await a.mouse.down();
await a.mouse.move(se.x + 40, se.y + 20, { steps: 6 });
await a.mouse.up();
const r2 = await ed(a, () => window.__dbm.board.elements.find((e) => e.type === 'image'));
check('image move', r2.x !== r1.x && r2.w === r1.w, `${r1.x},${r1.y} → ${r2.x},${r2.y}`);
await a.keyboard.press('Escape');

// ---- eraser: sweep across the line
await a.keyboard.press('e');
await a.mouse.move(650, 280);
await a.mouse.down();
await a.mouse.move(700, 330, { steps: 8 });
await a.mouse.up();
els = await elements(a);
check('eraser', !els.some((e) => e.type === 'arrow'));

// ---- undo restores the erased line
await a.keyboard.press('Meta+z');
els = await elements(a);
check('undo after erase', els.some((e) => e.type === 'arrow'));

// ---- share: start a session
await a.keyboard.press('v');
await a.click('.share-btn');
await a.fill('.share-pop input', 'Alice');
await a.click('.share-pop .btn.primary');
const link = await a.evaluate(() => location.href);
check('share link created', /#live=[\w-]{16,}\.[\w-]{22}$/.test(link));
await waitFor(a, () => document.querySelector('.share-btn')?.textContent?.includes('Live'));
await a.screenshot({ path: `${out}/2-share.png` });

// ---- B joins and receives the board (including the image asset)
await b.goto(link);
await b.waitForFunction(() => window.__dbm);
const joined = await waitFor(b, (n) => window.__dbm.board.elements.length === n, els.length);
check('joiner receives board', joined, `${(await elements(b)).length}/${els.length} elements`);
const imgOnB = await waitFor(b, () => {
  const el = window.__dbm.board.elements.find((e) => e.type === 'image');
  return !!el;
});
check('joiner receives image element', imgOnB);
const bImg = await ed(b, () => window.__dbm.board.elements.find((e) => e.type === 'image'));
await b.waitForTimeout(400);
await ed(b, (r) => window.__dbm.zoomToFit(), null);
await b.waitForTimeout(100);
check('joiner draws the image (asset synced)', await waitFor(b, (r) => {
  const c = document.querySelectorAll('canvas')[0];
  const s = window.__dbm.toScreen({ x: r.x + 10, y: r.y + 10 });
  const d = c.getContext('2d').getImageData(Math.round(s.x * devicePixelRatio), Math.round(s.y * devicePixelRatio), 1, 1).data;
  return d[2] > 200 && d[0] < 120;
}, bImg));
check('joiner sees one other person', await waitFor(b, () => window.__dbm.peers.size === 1));

// ---- live edits both ways
await ed(a, () => {
  const box = window.__dbm.board.elements.find((e) => e.type === 'box' && !e.icon);
  window.__dbm.store.transact((d) => d.update(box.id, { x: 111, label: 'From Alice' }));
});
check('A → B edit', await waitFor(b, () => window.__dbm.board.elements.some((e) => e.label === 'From Alice' && e.x === 111)));
await ed(b, () => window.__dbm.store.transact((d) => d.put({ id: 'from-bob', type: 'ellipse', x: 900, y: 500, w: 120, h: 80, rot: 0, stroke: 'blue', fill: 'none', width: 2, dash: 'solid', label: 'From Bob' })));
check('B → A edit', await waitFor(a, () => window.__dbm.board.elements.some((e) => e.id === 'from-bob')));

// ---- B's undo only reverts B's change
await ed(b, () => window.__dbm.undo());
check('B undo removes only its ellipse on A', await waitFor(a, () => !window.__dbm.board.elements.some((e) => e.id === 'from-bob') && window.__dbm.board.elements.some((e) => e.label === 'From Alice')));

// ---- presence: B's cursor shows on A
await b.mouse.move(500, 500);
await b.mouse.move(520, 510, { steps: 3 });
check('cursor presence', await waitFor(a, () => [...window.__dbm.peers.values()].some((p) => p.cursor)));

// ---- chat both ways
await b.click('[aria-label^="Chat"]');
await b.fill('.chat-input textarea', 'hey alice 👋');
await b.keyboard.press('Enter');
check('chat badge on A', await waitFor(a, () => document.querySelector('.badge')?.textContent === '1'));
await a.click('[aria-label^="Chat"]');
check('chat message on A', await waitFor(a, () => document.querySelector('.chat-list')?.textContent?.includes('hey alice')));
await a.fill('.chat-input textarea', 'hi bob');
await a.keyboard.press('Enter');
check('chat reply on B', await waitFor(b, () => document.querySelector('.chat-list')?.textContent?.includes('hi bob')));
await a.waitForTimeout(300);
await a.screenshot({ path: `${out}/3-collab-a.png` });
await b.screenshot({ path: `${out}/4-collab-b.png` });

// ---- convergence
const norm = (els) => JSON.stringify(els.map((e) => e.id).sort());
check('boards converge', norm(await elements(a)) === norm(await elements(b)));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
