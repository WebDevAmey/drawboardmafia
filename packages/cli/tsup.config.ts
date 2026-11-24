import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { dbm: 'src/bin.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: [/^@dbm\//],
  external: ['@resvg/resvg-js'],
  banner: { js: '#!/usr/bin/env node' },
});
