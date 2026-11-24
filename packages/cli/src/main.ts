import { parseArgs } from 'node:util';
import { render } from './commands/render';
import { check, convert, diff, fmt, merge } from './commands/files';
import { init } from './commands/init';
import { UsageError, type IO } from './io';
import { VERSION } from './version';

const HELP = `dbm ${VERSION} — tools for .board files

  dbm render <file> [-o out.svg|out.png] [--theme light|dark] [--frame id] [--scale n] [--padding n]
  dbm fmt [--check] <files…>          rewrite files in canonical form (or check)
  dbm check <files…>                  report syntax errors and dangling references
  dbm merge <base> <ours> <theirs>    three-way merge (git merge driver)
  dbm diff <old> <new>                semantic summary of changes
  dbm init [--driver cmd]             set up the git merge driver in this repo
  dbm from-mermaid <file> [-o out]    convert a Mermaid flowchart
  dbm from-excalidraw <file> [-o out] convert an .excalidraw file

Exit codes: 0 ok, 1 problems found, 2 usage or IO error.
`;

export async function run(argv: string[], io: IO): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        output: { type: 'string', short: 'o' },
        theme: { type: 'string' },
        frame: { type: 'string' },
        scale: { type: 'string' },
        padding: { type: 'string' },
        check: { type: 'boolean' },
        driver: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    io.stderr(`dbm: ${(e as Error).message}\n`);
    return 2;
  }
  const { values: o, positionals } = parsed;
  const [cmd, ...rest] = positionals;
  if (o.version) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  if (o.help || !cmd) {
    io.stdout(HELP);
    return o.help ? 0 : 2;
  }
  try {
    switch (cmd) {
      case 'render': return render(io, rest[0], o);
      case 'fmt': return fmt(io, rest, !!o.check);
      case 'check': return check(io, rest);
      case 'merge': return merge(io, rest);
      case 'diff': return diff(io, rest);
      case 'init': return init(io, o.driver);
      case 'from-mermaid': return convert(io, 'mermaid', rest[0], o.output);
      case 'from-excalidraw': return convert(io, 'excalidraw', rest[0], o.output);
      default:
        io.stderr(`dbm: unknown command '${cmd}'\n\n${HELP}`);
        return 2;
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`dbm: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}
