# React Coding Rules

## Components

- One component per file (except small, tightly coupled helpers)
- Name file same as component: `MyComponent.tsx`
- Export component as default only if it's the route page component
- Use named exports for everything else

## Hooks

- Prefix custom hooks with `use`: `useMyHook`
- Keep hooks focused on a single concern
- Extract complex logic into custom hooks
- Don't call hooks conditionally

## Performance

- Use `React.memo()` only when profiling shows a bottleneck
- Use `useMemo` / `useCallback` only when passing to memoized children
- Avoid inline object/array creation in JSX props
- Use `key` prop correctly in lists (no index keys for dynamic lists)

## Testing

- Test behavior, not implementation
- Use `@testing-library/react` patterns
- Prefer `getByRole` over `getByTestId`
- Write integration tests for user flows, unit tests for utils
