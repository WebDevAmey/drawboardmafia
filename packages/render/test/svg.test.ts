import { describe, expect, test } from 'vitest';
import { parse } from '@dbm/format';
import { THEMES } from '@dbm/core';
import { extractBoardSource, renderSvg } from '../src';

const board = (body: string) => parse(`board 1\n${body}`).board;

/** Minimal well-formedness check: every opened tag is closed in order. */
function balanced(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  return stack.length === 0;
}

const viewBox = (svg: string) => svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)!.slice(1).map(Number);

const FULL = `api: box "API" @0,0 rot=10
db: cylinder "DB" @400,0
e: ellipse "E" @0,200
d: diamond "D" @400,200
t: text "hello\\nworld" @0,400 align=c
n: note "remember" @200,400
c: code "const x = 1;" @400,400 lang=ts
f: frame "F" @-40,-40 700x380 { api db }
i: image @800,0 asset=${'a'.repeat(64)}.png
~inkabc: ink @800,300 pts=AAIAAAoJ
api -> db "reads" route=elbow
api-e: api <-> e route=curve dash=dashed
free: (900,500) -- d via="850,450"
`;

describe('renderSvg', () => {
  test('renders every element type as well-formed svg', () => {
    const svg = renderSvg(board(FULL));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(balanced(svg)).toBe(true);
    for (const s of ['<rect', '<ellipse', '<polygon', '<path', '<text', 'rotate(10']) expect(svg).toContain(s);
  });

  test('viewBox covers all elements plus padding', () => {
    const [x, y, w, h] = viewBox(renderSvg(board('a: box @0,0\nb: box @500,300\n'), { padding: 10 }));
    expect([x, y, w, h]).toEqual([-10, -10, 660 + 20, 380 + 20]);
  });

  test('escapes text', () => {
    const svg = renderSvg(board('a: box "<script>alert(1)</script> & co" @0,0\n'));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp; co');
  });

  test('dark theme uses dark palette', () => {
    const svg = renderSvg(board('a: box @0,0 stroke=blue\n'), { theme: 'dark' });
    expect(svg).toContain(THEMES.dark.stroke.blue);
    expect(svg).not.toContain(THEMES.light.stroke.blue);
  });

  test('frame option renders only the frame and its members', () => {
    const svg = renderSvg(board(FULL), { frame: 'f', padding: 0 });
    expect(svg).toContain('>API<');
    expect(svg).not.toContain('>remember<');
    expect(viewBox(svg)).toEqual([-40, -40, 700, 380]);
  });

  test('unknown frame throws', () => {
    expect(() => renderSvg(board('a: box\n'), { frame: 'nope' })).toThrow(/frame/);
  });

  test('dangling connector ends are skipped', () => {
    expect(() => renderSvg(board('a: box @0,0\na -> ghost\n'))).not.toThrow();
  });

  test('unplaced nodes are auto-placed', () => {
    expect(renderSvg(board('a: box "A"\n'))).toContain('>A<');
  });

  test('image uses asset resolver, else placeholder', () => {
    const b = board(`i: image @0,0 asset=${'a'.repeat(64)}.png\n`);
    expect(renderSvg(b, { assets: () => 'data:image/png;base64,AAAA' })).toContain('href="data:image/png;base64,AAAA"');
    expect(renderSvg(b)).not.toContain('<image');
  });

  test('embedded source round-trips', () => {
    const src = 'board 1\na: box "x & <y>" @0,0\n';
    const svg = renderSvg(parse(src).board, { source: src });
    expect(balanced(svg)).toBe(true);
    expect(extractBoardSource(svg)).toBe(src);
    expect(extractBoardSource('<svg></svg>')).toBeUndefined();
  });

  test('empty board', () => {
    expect(balanced(renderSvg(board('')))).toBe(true);
  });
});
