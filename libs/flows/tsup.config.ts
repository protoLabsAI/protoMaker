import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: true, // Enable code splitting for better tree-shaking
  external: [/^@automaker\//, /^@langchain\//],
});
