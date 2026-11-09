import { defineConfig } from 'tsup';

// One ESM bundle for production. @fig/shared ships as TypeScript source, so it's bundled in.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  noExternal: ['@fig/shared'],
});
