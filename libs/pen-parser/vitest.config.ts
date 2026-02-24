import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'pen-parser',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
