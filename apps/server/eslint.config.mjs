import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import n from 'eslint-plugin-n';

const eslintConfig = defineConfig([
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly',
        performance: 'readonly',
        EventSource: 'readonly',
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      n,
    },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      // Downgrade pre-existing base rule violations to warnings.
      // These should be fixed over time but must not block CI.
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'no-misleading-character-class': 'warn',
      'no-case-declarations': 'warn',
      'no-unreachable': 'warn',
      'no-redeclare': 'off', // TS handles this via overloads
      'no-undef': 'off', // TS handles this; Node globals like BufferEncoding aren't in eslint's scope

      // Catch imports of packages not declared in package.json.
      // This is the primary gate — prevents deploying code that
      // imports packages not in this workspace's package.json.
      'n/no-extraneous-import': 'error',

      // Ban hardcoded 'main' as a PR base branch fallback.
      // Use getEffectivePrBaseBranch() from lib/settings-helpers.ts or
      // DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch instead.
      // See: apps/server/src/routes/worktree/routes/create-pr.ts (incident: wasted $9.81, blocked 3 features)
      'no-restricted-syntax': [
        'error',
        {
          selector: "LogicalExpression[operator='||'] > Literal[value='main']",
          message:
            "Do not hardcode 'main' as a PR base branch fallback. Use getEffectivePrBaseBranch() from lib/settings-helpers.ts or DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch instead.",
        },
      ],

      // Ban direct imports of @ai-sdk/anthropic in route/service code.
      // Use getAnthropicModel() from lib/ai-provider.ts instead — it
      // resolves credentials via CLI OAuth, env vars, and credentials file.
      // Without this, routes fail when ANTHROPIC_API_KEY isn't set (e.g., Claude Max plans).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@ai-sdk/anthropic',
              message:
                'Import getAnthropicModel from lib/ai-provider.ts instead. Direct @ai-sdk/anthropic imports bypass CLI OAuth credential resolution.',
            },
          ],
        },
      ],
    },
    settings: {
      n: {
        // Allow workspace package imports (@protolabsai/*)
        allowModules: [],
        // Use the server's package.json for dependency resolution
        resolvePaths: ['.'],
      },
    },
  },
  // ai-provider.ts is the canonical wrapper for @ai-sdk/anthropic — it must import directly.
  {
    files: ['src/lib/ai-provider.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Test-specific overrides: relax rules that are impractical to enforce in test files.
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Allow `as any` in tests as a warning; typed factories are preferred but
      // tests need escape hatches for complex mocks that can't be fully typed.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Tests legitimately use the generic `Function` type for mock callbacks.
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      // Generator functions used as mock async iterators often lack yield.
      'require-yield': 'warn',
      // Regex literals with spaces are sometimes intentional in test fixtures.
      'no-regex-spaces': 'warn',
      // Tests use @/ path aliases which the n plugin cannot resolve to node_modules.
      'n/no-extraneous-import': 'off',
    },
  },
  globalIgnores(['dist/**', 'node_modules/**']),
]);

export default eslintConfig;
