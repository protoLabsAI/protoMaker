import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Harness eval project (#3904). Runs golden pipeline scenarios under
 * `apps/server/eval/**​/*.eval.ts` and emits a scorecard. Kept separate from the
 * normal `test:server` suite (which only picks up `tests/**`) so eval runs are
 * explicit (`npm run eval:harness`) and never slow down unit-test feedback.
 */
export default defineConfig({
  // Resolve eval globs + setup relative to apps/server, not the repo root.
  root: __dirname,
  test: {
    name: 'eval',
    reporters: ['verbose'],
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['eval/**/*.eval.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    // Scenarios share the scorecard collector; run serially in one process so
    // the afterAll scorecard write sees every recorded result.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@protolabsai/utils': path.resolve(__dirname, '../../libs/utils/src/index.ts'),
      '@protolabsai/platform': path.resolve(__dirname, '../../libs/platform/src/index.ts'),
      '@protolabsai/types': path.resolve(__dirname, '../../libs/types/src/index.ts'),
      '@protolabsai/model-resolver': path.resolve(
        __dirname,
        '../../libs/model-resolver/src/index.ts'
      ),
      '@protolabsai/dependency-resolver': path.resolve(
        __dirname,
        '../../libs/dependency-resolver/src/index.ts'
      ),
      '@protolabsai/git-utils': path.resolve(__dirname, '../../libs/git-utils/src/index.ts'),
      '@protolabsai/prompts': path.resolve(__dirname, '../../libs/prompts/src/index.ts'),
      '@protolabsai/error-tracking': path.resolve(
        __dirname,
        '../../libs/error-tracking/src/index.ts'
      ),
    },
  },
});
