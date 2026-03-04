// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const eslintConfig = defineConfig([
  js.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Browser/DOM APIs
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        atob: 'readonly',
        crypto: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // DOM Element Types
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLSpanElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLHeadingElement: 'readonly',
        HTMLParagraphElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLAudioElement: 'readonly',
        Element: 'readonly',
        // Event Types
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        DragEvent: 'readonly',
        PointerEvent: 'readonly',
        CustomEvent: 'readonly',
        ClipboardEvent: 'readonly',
        WheelEvent: 'readonly',
        MediaQueryListEvent: 'readonly',
        DataTransfer: 'readonly',
        // Web APIs
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        XMLHttpRequest: 'readonly',
        Audio: 'readonly',
        ScrollBehavior: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Fetch API types
        RequestCache: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        // Timers
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        // Node.js (for scripts and Electron)
        process: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        NodeJS: 'readonly',
        // React
        React: 'readonly',
        JSX: 'readonly',
        // Electron
        Electron: 'readonly',
        // Console
        console: 'readonly',
        // Vite defines
        __APP_VERSION__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
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
      '@typescript-eslint/no-explicit-any': 'warn',
      // TS handles these — ESLint's base rules don't understand TS overloads or DOM types
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        {
          'ts-nocheck': 'allow-with-description',
        },
      ],
    },
  },
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // Disabled: crashes with minimatch@10 (root override). Other a11y rules remain active.
      'jsx-a11y/label-has-associated-control': 'off',
      // Downgraded to warnings for baseline — existing codebase has many pre-existing violations.
      // Future A11y tasks should fix these incrementally.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
    },
  },
  globalIgnores([
    'dist/**',
    'dist-electron/**',
    'node_modules/**',
    'server-bundle/**',
    'release/**',
    'src/routeTree.gen.ts',
  ]),
  ...storybook.configs['flat/recommended'],
]);

export default eslintConfig;
