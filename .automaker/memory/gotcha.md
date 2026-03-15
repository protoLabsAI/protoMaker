---
tags: [gotcha]
summary: gotcha implementation decisions and patterns
relevantTo: [gotcha]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 1
  successfulFeatures: 1
---

# gotcha

#### [Gotcha] Zod enum with default method: chaining order matters. z.enum(['a', 'b']).default('a') works, but z.enum(['a', 'b']).optional().default('a') behavior differs from z.enum(['a', 'b']).default('a').optional() (2026-03-15)

- **Situation:** Writing example tools with Zod schemas that have optional fields with defaults (e.g., language: enum with default 'en')
- **Root cause:** Zod methods return new type instances; each method changes the type constraint (optional vs required, default present vs absent). Method order determines final type shape. Not obvious because the syntax looks order-independent.
- **How to avoid:** More testing required to verify schema behavior. Must consult Zod docs for method composition order. Benefits: explicit type construction, composable builders.

#### [Gotcha] Removal of unused React import (new JSX transform) assumes runtime is correctly configured. If tsconfig, Vite, or Next config changes to use old JSX transform, all components fail at runtime with 'React is not defined' (2026-03-15)

- **Situation:** Modern toolchains (React 17+, Vite, Next 12+) auto-transform JSX without requiring React import. Codebase removed all explicit React imports from JSX-only files.
- **Root cause:** Modern JSX transform is more ergonomic and reduces boilerplate. Toolchain handles injection automatically.
- **How to avoid:** Easier: cleaner imports, smaller compiled output. Harder: brittle—depends on hidden config that's easy to break and hard to debug (error is 'React is not defined', not 'JSX transform not configured')
