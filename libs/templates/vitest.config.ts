import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@protolabsai/templates': path.resolve(__dirname, './src/index.ts'),
      '@protolabsai/types': path.resolve(__dirname, '../types/src/index.ts'),
    },
  },
  test: {
    name: 'templates',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
