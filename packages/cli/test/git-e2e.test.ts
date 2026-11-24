import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, expect, test } from 'vitest';

const BIN = resolve(__dirname, '../dist/dbm.js');

beforeAll(() => {
  if (!existsSync(BIN)) execFileSync('pnpm', ['build'], { cwd: resolve(__dirname, '..'), stdio: 'ignore' });
}, 60_000);

function repo(withDriver: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'dbm-git-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'test');
  git('config', 'user.email', 'test@example.com');
  if (withDriver) execFileSync('node', [BIN, 'init', '--driver', `node ${JSON.stringify(BIN)}`], { cwd: dir });
  const write = (text: string) => writeFileSync(join(dir, 'arch.board'), text);
  const commit = (msg: string) => {
    git('add', '-A');
    git('commit', '-qm', msg);
  };
  return { dir, git, write, commit, read: () => readFileSync(join(dir, 'arch.board'), 'utf8') };
}

const BASE = 'board 1\napi: box "API" @0,0\ndb: cylinder "DB" @300,0\napi -> db\n';

function scenario(r: ReturnType<typeof repo>) {
  r.write(BASE);
  r.commit('base');
  r.git('checkout', '-qb', 'theirs');
  // theirs: relabel api (same line as ours' edit) and add a queue
  r.write(BASE.replace('"API"', '"Gateway"') + 'queue: box "Queue" @0,200\napi -> queue\n');
  r.commit('relabel and add queue');
  r.git('checkout', '-q', 'main');
  // ours: move api
  r.write(BASE.replace('@0,0', '@40,0'));
  r.commit('move api');
  return spawnSync('git', ['merge', '--no-edit', 'theirs'], { cwd: r.dir, encoding: 'utf8' });
}

test('git merge with the dbm driver combines same-line edits cleanly', () => {
  const r = repo(true);
  const result = scenario(r);
  expect(result.status).toBe(0);
  const merged = r.read();
  expect(merged).not.toContain('<<<<<<<');
  expect(merged).toBe(
    'board 1\napi: box "Gateway" @40,0\ndb: cylinder "DB" @300,0\napi -> db\nqueue: box "Queue" @0,200\napi -> queue\n',
  );
}, 30_000);

test('control: without the driver, git reports a conflict', () => {
  const r = repo(false);
  const result = scenario(r);
  expect(result.status).not.toBe(0);
  expect(r.read()).toContain('<<<<<<<');
}, 30_000);
