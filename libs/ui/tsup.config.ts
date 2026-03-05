import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/atoms/index.ts',
    'src/molecules/index.ts',
    'src/organisms/index.ts',
    'src/lib/index.ts',
    'src/ai/index.ts',
  ],
  format: ['esm'],
  external: [/^@rjsf\//],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
