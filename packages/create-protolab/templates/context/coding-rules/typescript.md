# TypeScript Coding Rules

## Type Safety

- **strict mode**: Always enabled. Never use `any` without justification.
- **Explicit return types**: Required for exported functions.
- **No non-null assertions**: Avoid `!` operator. Use proper narrowing instead.
- **Prefer `unknown` over `any`**: When the type is truly unknown, use `unknown` and narrow.

## Import Conventions

- Use `type` imports for type-only imports: `import type { Foo } from './foo.js'`
- Always include `.js` extension in relative imports (ESM)
- Use workspace package names for cross-package imports

## Naming Conventions

- **Files**: kebab-case (`my-service.ts`)
- **Types/Interfaces**: PascalCase (`MyService`)
- **Functions/Variables**: camelCase (`myFunction`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Enums**: PascalCase members (`enum Status { Active, Inactive }`)

## Error Handling

- Use typed error classes for domain errors
- Always catch specific errors, not bare `catch {}`
- Log errors with context (what was being attempted)
- Return `Result<T, E>` types for expected failures

## Async Patterns

- Use `async/await` over raw Promises
- Always handle Promise rejections
- Use `Promise.all` for independent parallel operations
- Add timeouts to external calls
