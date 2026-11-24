import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { run } from '../src/main';
import { VERSION } from '../src/version';
import pkg from '../package.json';

let dir: string;
let out: string[];
let err: string[];
const io = () => ({ cwd: dir, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) });
const dbm = (...args: string[]) => run(args, io());
const write = (name: string, text: string) => writeFileSync(join(dir, name), text);
const read = (name: string) => readFileSync(join(dir, name), 'utf8');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dbm-'));
  out = [];
  err = [];
});

test('version matches package.json', async () => {
  expect(VERSION).toBe(pkg.version);
  expect(await dbm('--version')).toBe(0);
  expect(out.join('')).toContain(VERSION);
});

test('help and unknown commands', async () => {
  expect(await dbm('--help')).toBe(0);
  expect(out.join('')).toContain('dbm render');
  expect(await dbm('nope')).toBe(2);
});

describe('fmt', () => {
  test('--check flags non-canonical files, fmt fixes them', async () => {
    write('a.board', 'board 1\napi:   box "A"  fill=none\n');
    write('b.board', 'board 1\nb: box\n');
    expect(await dbm('fmt', '--check', 'a.board', 'b.board')).toBe(1);
    expect(err.join('')).toContain('a.board');
    expect(err.join('')).not.toContain('b.board');
    expect(await dbm('fmt', 'a.board', 'b.board')).toBe(0);
    expect(read('a.board')).toBe('board 1\napi: box "A"\n');
    expect(await dbm('fmt', '--check', 'a.board')).toBe(0);
  });

  test('never rewrites a file with errors', async () => {
    write('bad.board', 'board 1\na: box\nb: blob\n');
    expect(await dbm('fmt', 'bad.board')).toBe(1);
    expect(read('bad.board')).toBe('board 1\na: box\nb: blob\n');
  });
});

test('check reports dangling references with file:line', async () => {
  write('a.board', 'board 1\na: box\na -> ghost\n');
  expect(await dbm('check', 'a.board')).toBe(1);
  expect(err.join('')).toContain("a.board:3: warning: unknown element 'ghost'");
  write('ok.board', 'board 1\na: box\n');
  expect(await dbm('check', 'ok.board')).toBe(0);
});

describe('render', () => {
  test('svg with embedded source and png with valid signature', async () => {
    write('d.board', 'board 1\na: box "Hello" @0,0\nb: box "World" @300,0\na -> b\n');
    expect(await dbm('render', 'd.board', '-o', 'd.svg')).toBe(0);
    const svg = read('d.svg');
    expect(svg).toContain('>Hello<');
    expect(svg).toContain('urn:drawboardmafia:board:1');
    expect(await dbm('render', 'd.board', '-o', 'd.png', '--theme', 'dark')).toBe(0);
    const png = readFileSync(join(dir, 'd.png'));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test('svg to stdout when no -o', async () => {
    write('d.board', 'board 1\na: box "Hi" @0,0\n');
    expect(await dbm('render', 'd.board')).toBe(0);
    expect(out.join('')).toContain('<svg');
  });

  test('inlines image assets from the sibling assets folder', async () => {
    const hash = 'a'.repeat(64);
    write('i.board', `board 1\ni: image @0,0 asset=${hash}.png\n`);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, 'i.board.assets'));
    writeFileSync(join(dir, 'i.board.assets', `${hash}.png`), Buffer.from([1, 2, 3]));
    expect(await dbm('render', 'i.board', '-o', 'i.svg')).toBe(0);
    expect(read('i.svg')).toContain('href="data:image/png;base64,AQID"');
  });

  test('unknown output extension is a usage error', async () => {
    write('d.board', 'board 1\n');
    expect(await dbm('render', 'd.board', '-o', 'd.gif')).toBe(2);
  });
});

describe('merge', () => {
  test('writes merged result into ours', async () => {
    write('o', 'board 1\na: box "A" @0,0\n');
    write('a', 'board 1\na: box "A" @40,0\n');
    write('b', 'board 1\na: box "B" @0,0\n');
    expect(await dbm('merge', 'o', 'a', 'b')).toBe(0);
    expect(read('a')).toBe('board 1\na: box "B" @40,0\n');
  });

  test('reports conflicts on stderr, still exits 0', async () => {
    write('o', 'board 1\na: box "A"\n');
    write('a', 'board 1\na: box "X"\n');
    write('b', 'board 1\na: box "Y"\n');
    expect(await dbm('merge', 'o', 'a', 'b')).toBe(0);
    expect(read('a')).toBe('board 1\na: box "X"\n');
    expect(err.join('')).toContain('a.label');
  });

  test('parse errors leave ours untouched and signal a conflict', async () => {
    write('o', 'board 1\n');
    write('a', 'board 1\nx: blob\n');
    write('b', 'board 1\nb: box\n');
    expect(await dbm('merge', 'o', 'a', 'b')).toBe(1);
    expect(read('a')).toBe('board 1\nx: blob\n');
  });
});

test('diff prints semantic changes (plain and git external form)', async () => {
  write('old', 'board 1\na: box @0,0\n');
  write('new', 'board 1\na: box @10,0\nb: box\n');
  expect(await dbm('diff', 'old', 'new')).toBe(0);
  expect(out.join('')).toBe('a: moved (+10,0)\nadded b (box)\n');
  out = [];
  expect(await dbm('diff', 'x.board', '/dev/null', '0000', '100644', 'new', 'abcd', '100644')).toBe(0);
  expect(out.join('')).toBe('x.board\n  added a (box)\n  added b (box)\n');
});

test('from-mermaid and from-excalidraw', async () => {
  write('m.mmd', 'flowchart LR\nA --> B\n');
  expect(await dbm('from-mermaid', 'm.mmd', '-o', 'm.board')).toBe(0);
  expect(read('m.board')).toMatch(/^board 1\na: box "A" @\d+,\d+\n/);
  write('e.excalidraw', JSON.stringify({ type: 'excalidraw', elements: [{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, roughness: 0 }] }));
  expect(await dbm('from-excalidraw', 'e.excalidraw')).toBe(0);
  expect(out.join('')).toMatch(/^board 1\n~[a-z0-9]{6}: box @0,0 10x10\n$/);
  write('bad.json', '{not json');
  expect(await dbm('from-excalidraw', 'bad.json')).toBe(1);
});

test('refuses files over the size cap', async () => {
  write('big.board', 'board 1\n' + '// x\n'.repeat(10));
  expect(await run(['check', 'big.board'], { ...io(), maxBytes: 20 })).toBe(2);
  expect(err.join('')).toContain('too large');
});

test('init writes .gitattributes and git config', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  expect(await dbm('init', '--driver', 'node /x/dbm.js')).toBe(0);
  expect(await dbm('init', '--driver', 'node /x/dbm.js')).toBe(0);
  expect(read('.gitattributes')).toBe('*.board merge=dbm\n');
  expect(execFileSync('git', ['config', 'merge.dbm.driver'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('node /x/dbm.js merge %O %A %B');
  expect(existsSync(join(dir, '.gitattributes'))).toBe(true);
});
