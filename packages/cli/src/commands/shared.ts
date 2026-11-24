import type { Diagnostic } from '@dbm/format';
import type { IO } from '../io';

export function printDiagnostics(io: IO, file: string, ds: Diagnostic[]) {
  for (const d of ds) io.stderr(`${file}:${d.line}: ${d.severity}: ${d.message}\n`);
}
