import fc from 'fast-check';
import { NODE_TYPES, PALETTE_TOKENS, defaultFill, defaultSize, type Board, type Element, type End, type NodeType } from '@dbm/core';

const slug = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}(-[a-z0-9]{1,3})?$/);
const anon = fc.stringMatching(/^~[a-z0-9]{6}$/);
const color = fc.oneof(fc.constantFrom(...PALETTE_TOKENS), fc.stringMatching(/^#[0-9a-f]{6}$/));
const coord = fc.integer({ min: -5000, max: 5000 });
const text = fc.string({ unit: 'grapheme', maxLength: 20 }).map((s) => s.replace(/\r/g, ''));
const comment = fc.string({ maxLength: 12 }).map((s) => s.replace(/[\r\n]/g, ''));
const maybe = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined });

const style = fc.record({
  stroke: color,
  width: fc.constantFrom(1, 2, 4) as fc.Arbitrary<1 | 2 | 4>,
  dash: fc.constantFrom('solid', 'dashed', 'dotted') as fc.Arbitrary<'solid' | 'dashed' | 'dotted'>,
  sketch: maybe(fc.constantFrom(0, 1, 2) as fc.Arbitrary<0 | 1 | 2>),
  locked: maybe(fc.constant(true)),
  group: maybe(slug),
  comments: maybe(fc.array(comment, { minLength: 1, maxLength: 2 })),
});

function strip<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function nodeArb(id: string, ids: string[]): fc.Arbitrary<Element> {
  return fc
    .record({
      type: fc.constantFrom(...NODE_TYPES),
      placed: fc.boolean(),
      x: coord, y: coord,
      size: maybe(fc.tuple(fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 0, max: 2000 }))),
      rot: fc.oneof(fc.constant(0), fc.integer({ min: -3599, max: 3599 }).map((n) => n / 10)),
      fill: maybe(fc.oneof(color, fc.constant('none' as const))),
      str: maybe(text),
      font: maybe(fc.constantFrom('sans', 'mono', 'hand') as fc.Arbitrary<'sans' | 'mono' | 'hand'>),
      fsize: maybe(fc.constantFrom(1, 2, 3, 4) as fc.Arbitrary<1 | 2 | 3 | 4>),
      align: maybe(fc.constantFrom('l', 'c', 'r') as fc.Arbitrary<'l' | 'c' | 'r'>),
      lang: maybe(fc.constantFrom('ts', 'python', 'c++')),
      icon: maybe(fc.constantFrom('server', 'cloud', 'api-2')),
      members: fc.subarray(ids, { maxLength: Math.min(4, ids.length) }),
      asset: fc.stringMatching(/^[a-f0-9]{64}\.png$/),
      pts: fc.array(fc.tuple(coord, coord, fc.oneof(fc.constant(0.5), fc.integer({ min: 0, max: 255 }).map((n) => n / 255))), { maxLength: 6 }),
      style,
    })
    .map((r) => {
      const type = r.type as NodeType;
      const d = defaultSize(type);
      const base = strip({
        id, type, x: r.placed ? r.x : undefined, y: r.placed ? r.y : undefined,
        w: type === 'ink' ? 0 : (r.size?.[0] ?? d.w), h: type === 'ink' ? 0 : (r.size?.[1] ?? d.h),
        rot: r.rot, ...r.style, fill: type === 'ink' ? defaultFill(type) : (r.fill ?? defaultFill(type)),
      });
      switch (type) {
        case 'box': case 'ellipse': case 'diamond': case 'cylinder':
          return strip({ ...base, label: r.str, font: r.font, size: r.fsize, icon: r.icon }) as Element;
        case 'text': case 'note':
          return strip({ ...base, text: r.str ?? '', font: r.font, size: r.fsize, align: r.align }) as Element;
        case 'code':
          return strip({ ...base, text: r.str ?? '', lang: r.lang }) as Element;
        case 'frame':
          return { ...base, name: r.str ?? '', members: r.members } as Element;
        case 'image':
          return { ...base, asset: r.asset } as Element;
        case 'ink':
          return { ...base, pts: r.pts } as Element;
      }
    });
}

function connectorArb(id: string, ids: string[]): fc.Arbitrary<Element> {
  const end: fc.Arbitrary<End> =
    ids.length > 0
      ? fc.oneof(fc.constantFrom(...ids).map((i) => ({ id: i })), fc.record({ x: coord, y: coord }))
      : fc.record({ x: coord, y: coord });
  return fc
    .record({
      from: end, to: end,
      head: fc.constantFrom('end', 'both', 'none') as fc.Arbitrary<'end' | 'both' | 'none'>,
      route: fc.constantFrom('straight', 'elbow', 'curve') as fc.Arbitrary<'straight' | 'elbow' | 'curve'>,
      label: maybe(text),
      via: maybe(fc.array(fc.tuple(coord, coord), { minLength: 1, maxLength: 3 })),
      style,
    })
    .map((r) => strip({ id, type: 'arrow', fill: 'none', ...r, ...r.style }) as Element);
}

export const boardArb: fc.Arbitrary<Board> = fc
  .uniqueArray(fc.oneof(slug, anon), { maxLength: 12 })
  .chain((ids) =>
    fc.tuple(
      fc.tuple(...ids.map((id, i) => (i % 3 === 2 ? connectorArb(id, ids.slice(0, i)) : nodeArb(id, ids.slice(0, i))))),
      fc.constantFrom(0, 1, 2) as fc.Arbitrary<0 | 1 | 2>,
      maybe(color),
      maybe(fc.constantFrom('dots', 'lines', 'none') as fc.Arbitrary<'dots' | 'lines' | 'none'>),
      fc.array(comment, { maxLength: 2 }),
    ),
  )
  .map(([elements, sketch, bg, grid, trailingComments]) =>
    strip({ version: 1 as const, sketch, bg: bg as Board['bg'], grid, elements, trailingComments }) as Board,
  );
