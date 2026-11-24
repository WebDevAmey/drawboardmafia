import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, type IO } from '../io';

const LINE = '*.board merge=dbm';

export function init(io: IO, driver = 'dbm'): number {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: io.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let root: string;
  try {
    root = git('rev-parse', '--show-toplevel');
  } catch {
    throw new UsageError('dbm init must run inside a git repository');
  }
  const attrs = join(root, '.gitattributes');
  const current = existsSync(attrs) ? readFileSync(attrs, 'utf8') : '';
  if (!current.split(/\r?\n/).some((l) => l.trim() === LINE)) {
    writeFileSync(attrs, current + (current && !current.endsWith('\n') ? '\n' : '') + LINE + '\n');
    io.stdout(`added '${LINE}' to .gitattributes\n`);
  }
  git('config', 'merge.dbm.name', 'drawboardmafia board merge');
  git('config', 'merge.dbm.driver', `${driver} merge %O %A %B`);
  io.stdout('configured git merge driver "dbm" for this repository\n');
  return 0;
}
