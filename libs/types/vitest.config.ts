import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@protolabs-ai/types': path.resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    name: 'types',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
