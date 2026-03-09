// ESLint 9 flat config — repo root
// Uses the typescript-eslint strict preset.
// Applies to all packages/, apps/, libs/, and agent/ directories.
// Per-package configs (apps/ui/eslint.config.mjs, etc.) layer additional rules
// on top when ESLint is run from within their own directory.
//
// Run:  pnpm lint        — check
//        pnpm lint:fix    — auto-fix

// @ts-check
const tseslint = require('typescript-eslint');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = tseslint.config(
  // ─── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/node_modules/**',
      '**/release/**',
      '**/server-bundle/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.gen.ts',
    ],
  },

  // ─── TypeScript strict preset: packages, apps, libs, agent ─────────────────
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'apps/**/*.{ts,tsx}',
      'libs/**/*.{ts,tsx}',
      'agent/**/*.{ts,tsx}',
    ],
    extends: [...tseslint.configs.strict],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Node / universal
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
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
        // Browser globals (for apps/ui and Electron renderer)
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        WebSocket: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        CustomEvent: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // React / JSX
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    rules: {
      // ── No explicit any ──────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',

      // ── No unused vars (allow _-prefixed escape hatches) ─────────────────
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── Import ordering ──────────────────────────────────────────────────
      // Enforces consistent import block ordering and alphabetical grouping.
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',

      // ── No cross-package relative imports ───────────────────────────────
      // Imports that traverse 3+ directory levels almost certainly cross a
      // package boundary in this monorepo. Use @proto/* workspace aliases
      // (e.g. @proto/types, @proto/utils) instead of relative paths.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./){3,}',
              message:
                'Cross-package relative imports are not allowed. Use @proto/* package imports instead (e.g. @proto/types).',
            },
          ],
        },
      ],

      // ── TypeScript handles these — disable to avoid noise ────────────────
      'no-undef': 'off',
      'no-redeclare': 'off',

      // ── Downgrade pre-existing violations to warnings (fix incrementally) ─
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'no-case-declarations': 'warn',
      'no-unreachable': 'warn',
    },
  },
);
