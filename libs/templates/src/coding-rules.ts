/**
 * Coding Rules Templates
 *
 * Stack-specific coding rules for AI agents.
 */

import type { CodingRulesType } from './types.js';

/**
 * Get coding rules for a given stack type.
 */
export function getCodingRules(type: CodingRulesType): string {
  switch (type) {
    case 'docs':
      return getDocsCodingRules();
    case 'extension':
      return getExtensionCodingRules();
    case 'typescript':
      return getTypeScriptCodingRules();
    case 'react':
      return getReactCodingRules();
  }
}

function getDocsCodingRules(): string {
  return `# Coding Rules

Rules for AI agents working on this documentation site.

## Content Structure (Diataxis)

Every page belongs to exactly one type. Never mix types on a single page.

- **Tutorial** — Learn by doing. Linear, guided, guaranteed success. No choices.
- **How-to Guide** — Accomplish a task. Steps only. Assumes knowledge. No explanation.
- **Reference** — Look something up. Complete, accurate, terse. Organized for scanning.
- **Explanation** — Understand the why. Conceptual, narrative. No instructions.

## Writing Style

- One sentence per line in source markdown (makes diffs clean)
- Code before prose — show the snippet first, explain second
- Active voice, second person ("you")
- Short sentences. No marketing language.
- Every page opens with one paragraph: what it covers, who it's for, what you'll have after reading

## Formatting

- Prettier is configured — run \`npm run format\` before committing
- Do NOT manually format code; let Prettier handle it
- Use markdownlint rules — run \`npm run lint:md\` to check

## Frontmatter

Every content page requires:

\`\`\`yaml
---
title: Outcome-Focused Title
description: One-line description for SEO and link previews
---
\`\`\`

## Images

- Store images in \`src/assets/\` and import them with relative paths
- Use descriptive alt text for accessibility
- Prefer SVG for diagrams and icons
`;
}

function getExtensionCodingRules(): string {
  return `# Coding Rules

Rules for AI agents working on this browser extension.

## TypeScript

- Strict mode enabled — no \`any\` types, handle all null cases
- All new code must be TypeScript
- Define message types in \`src/core/messaging.ts\` MessageMap interface

## Formatting

- Prettier is configured — run \`pnpm format\` before committing
- Do NOT manually format code; let Prettier handle it

## Linting

- ESLint v9+ (flat config) — fix all lint warnings
- \`web-ext lint\` validates Firefox AMO compliance
- Run \`pnpm lint\` to check both

## Testing

- Write tests for all new core modules
- Use Vitest for unit tests, mock \`browser\` global
- Use Playwright for E2E (Chromium persistent context only)
- Test directory: \`tests/unit/\` and \`tests/e2e/\`

## Browser Extension Specifics

- Never use \`eval()\`, \`new Function()\`, or inline script tags (CSP violation)
- Never load remote JS in production bundles
- Use \`browser.*\` API (not \`chrome.*\`) — WXT + webextension-polyfill handles the abstraction
- All new entrypoints go in \`entrypoints/\` — WXT auto-detects them
- Keep popup UI lightweight — it unmounts when closed
`;
}

function getTypeScriptCodingRules(): string {
  return `# Coding Rules

Rules for AI agents working on this codebase.

## Type Safety

- **strict mode**: Always enabled. Never use \`any\` without justification.
- **Explicit return types**: Required for exported functions.
- **No non-null assertions**: Avoid \`!\` operator. Use proper narrowing instead.
- **Prefer \`unknown\` over \`any\`**: When the type is truly unknown, use \`unknown\` and narrow.

## Import Conventions

- Use \`type\` imports for type-only imports: \`import type { Foo } from './foo.js'\`
- Always include \`.js\` extension in relative imports (ESM)
- Use workspace package names for cross-package imports

## Naming Conventions

- **Files**: kebab-case (\`my-service.ts\`)
- **Types/Interfaces**: PascalCase (\`MyService\`)
- **Functions/Variables**: camelCase (\`myFunction\`)
- **Constants**: UPPER_SNAKE_CASE (\`MAX_RETRIES\`)
- **Enums**: PascalCase members (\`enum Status { Active, Inactive }\`)

## Error Handling

- Use typed error classes for domain errors
- Always catch specific errors, not bare \`catch {}\`
- Log errors with context (what was being attempted)

## Async Patterns

- Use \`async/await\` over raw Promises
- Always handle Promise rejections
- Use \`Promise.all\` for independent parallel operations

## Formatting

- Prettier is configured — run format before committing
- Do NOT manually format code; let Prettier handle it

## Testing

- Write tests for all new functionality
- Test behavior, not implementation
`;
}

function getReactCodingRules(): string {
  return `# Coding Rules

Rules for AI agents working on this React codebase.

## Type Safety

- **strict mode**: Always enabled. Never use \`any\` without justification.
- **Explicit return types**: Required for exported functions.
- **No non-null assertions**: Avoid \`!\` operator. Use proper narrowing instead.

## React Components

- One component per file (except small, tightly coupled helpers)
- Name file same as component: \`MyComponent.tsx\`
- Export component as default only if it's the route page component
- Use named exports for everything else

## React Hooks

- Prefix custom hooks with \`use\`: \`useMyHook\`
- Keep hooks focused on a single concern
- Extract complex logic into custom hooks
- Don't call hooks conditionally

## Styling

- Use Tailwind CSS utility classes
- Extract repeated patterns into components, not utility functions
- Use \`cn()\` helper for conditional classes

## Naming Conventions

- **Files**: kebab-case for utils (\`my-service.ts\`), PascalCase for components (\`MyComponent.tsx\`)
- **Types/Interfaces**: PascalCase (\`MyService\`)
- **Functions/Variables**: camelCase (\`myFunction\`)

## Formatting

- Prettier is configured — run format before committing
- Do NOT manually format code; let Prettier handle it

## Testing

- Write tests for all new functionality
- Use Vitest for unit tests
- Test behavior, not implementation
`;
}
