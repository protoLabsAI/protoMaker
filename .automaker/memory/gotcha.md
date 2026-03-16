---
tags: [gotcha]
summary: gotcha implementation decisions and patterns
relevantTo: [gotcha]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 2
  referenced: 1
  successfulFeatures: 1
---
# gotcha

#### [Gotcha] String literal references vs code imports are different usage types. Server code had `"revise"` as string literals in configuration, not imported the function. Grep-based search found no imports, correctly indicating the export was dead. (2026-03-14)
- **Situation:** After removing `revise` export, verified server code by grepping for imports. Found only string literal references like `"revise"` in execution strings, not `import { revise }`.
- **Root cause:** Distinguishing between static code references and data-driven references is critical for cleanup. A string literal doesn't create a dependency on the export.
- **How to avoid:** Requires careful grep patterns to distinguish import statements from string literals. More effort than simple 'does this name appear anywhere' search.

#### [Gotcha] API client obtained via `getHttpApiClient()` called inside query function - instantiated on every query evaluation, not cached (2026-03-15)
- **Situation:** Multiple useQuery hooks each call getHttpApiClient() independently
- **Root cause:** Likely no dependency injection system in place; straightforward imperative approach; works but creates multiple instances
- **How to avoid:** Simple to read and understand; no provider setup needed; but multiple instantiations could be expensive if getHttpApiClient() does complex initialization

#### [Gotcha] Zod enum with default method: chaining order matters. z.enum(['a', 'b']).default('a') works, but z.enum(['a', 'b']).optional().default('a') behavior differs from z.enum(['a', 'b']).default('a').optional() (2026-03-15)
- **Situation:** Writing example tools with Zod schemas that have optional fields with defaults (e.g., language: enum with default 'en')
- **Root cause:** Zod methods return new type instances; each method changes the type constraint (optional vs required, default present vs absent). Method order determines final type shape. Not obvious because the syntax looks order-independent.
- **How to avoid:** More testing required to verify schema behavior. Must consult Zod docs for method composition order. Benefits: explicit type construction, composable builders.

#### [Gotcha] Removal of unused React import (new JSX transform) assumes runtime is correctly configured. If tsconfig, Vite, or Next config changes to use old JSX transform, all components fail at runtime with 'React is not defined' (2026-03-15)
- **Situation:** Modern toolchains (React 17+, Vite, Next 12+) auto-transform JSX without requiring React import. Codebase removed all explicit React imports from JSX-only files.
- **Root cause:** Modern JSX transform is more ergonomic and reduces boilerplate. Toolchain handles injection automatically.
- **How to avoid:** Easier: cleaner imports, smaller compiled output. Harder: brittle--depends on hidden config that's easy to break and hard to debug (error is 'React is not defined', not 'JSX transform not configured')

#### [Gotcha] NodeNext module resolution requires explicit .js extensions in all import paths, even within TypeScript packages (2026-03-15)
- **Situation:** TypeScript source compiles to dist/.js files. Node.js ESM doesn't infer .ts->.js transformation.
- **Root cause:** NodeNext resolution follows strict Node.js behavior: requires exact file extension. TypeScript compiler strips extensions during emit but doesn't rewrite source imports.
- **How to avoid:** Verbose import statements (import X from './file.js') vs Node.js compatibility


#### [Gotcha] Promise returned by runGracefulShutdown never resolves—process.exit(0) terminates before await completes (2026-03-16)
- **Situation:** Code calls `runGracefulShutdown(opts)` but the promise never resolves because the function calls process.exit(0)
- **Root cause:** process.exit() is synchronous and terminates the process immediately. The promise chain from signal handlers (.catch() block) handles errors, but successful completion is handled by process exit, not promise resolution.
- **How to avoid:** Promise return type is misleading but matches Node.js async patterns. Benefit is .catch() error handling in signal hooks. Cost is developer confusion about why promise never resolves.