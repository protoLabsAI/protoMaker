import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'types',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
