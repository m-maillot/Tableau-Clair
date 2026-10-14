import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node22',
  // Les paquets du workspace sont exposés en TypeScript source : on les embarque.
  noExternal: [/^@tableau-clair\//],
});
