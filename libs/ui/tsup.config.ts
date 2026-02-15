import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/atoms/index.ts', 'src/molecules/index.ts', 'src/organisms/index.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
  },
  clean: true,
  sourcemap: true,
  treeshake: true,
});
