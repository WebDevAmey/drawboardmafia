import { run } from './main';

run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`dbm: internal error: ${(e as Error).stack ?? e}\n`);
    process.exitCode = 2;
  },
);
