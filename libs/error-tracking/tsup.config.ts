import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['@protolabs-ai/types', '@protolabs-ai/utils', '@sentry/node', '@sentry/electron'],
});
