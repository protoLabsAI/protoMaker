# EventType Registration (REQUIRED)

## The Rule

Every event string emitted via `createEventEmitter()` MUST be registered in the `EventType` union in `libs/types/src/event.ts`.

If you add a new event (e.g., `ceremony:my-thing:complete`), you MUST add it to the `EventType` union. The build will fail with a TypeScript error if you don't.

## How It Works

`libs/types/src/event.ts` defines a discriminated string union:

```typescript
export type EventType =
  | 'feature:created'
  | 'feature:updated'
  | 'ceremony:fired'
  | 'ceremony:post-project-docs'
  | 'ceremony:post-project-docs:complete'
  | 'ceremony:post-project-docs:failed'
  // ... etc
```

The `EventCallback` type enforces that all emitted events match this union. If your code emits an event string not in this union, `tsc` will reject it at compile time.

## What To Do

1. Open `libs/types/src/event.ts`
2. Find the `EventType` union (it's a large `|`-separated string literal type)
3. Add your new event string(s) to the union
4. Run `npm run build:packages` to verify it compiles

## Common Mistake

Adding event emissions in a service file but forgetting to register the event name in `EventType`. This passes linting but fails the build.

## Naming Convention

Events follow a colon-separated namespace pattern:
- `{domain}:{action}` — e.g., `feature:created`, `agent:started`
- `{domain}:{sub}:{action}` — e.g., `ceremony:post-project-docs:complete`
