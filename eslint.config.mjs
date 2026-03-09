import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Root ESLint config — intentionally empty.
 *
 * Real lint rules live in apps/server/ and apps/ui/.
 * This file exists so that lint-staged can run `eslint --fix`
 * on files outside those directories (e.g. packages/mcp-server)
 * without failing due to a missing config.
 */
export default defineConfig([globalIgnores(['**/*'])]);
