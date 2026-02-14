# Milestone 2: Implementation Conformance

Make FeatureLoader and EventEmitter implement the new interfaces. Zero behavior change.

**Depends on:** Milestone 1 (Core Type Definitions)

## Phase 1: FeatureLoader implements FeatureStore

**Complexity:** medium

Update FeatureLoader class declaration to `implements FeatureStore`. Add any missing methods.

### What to build

1. Import `FeatureStore` from `@automaker/types`
2. Add `implements FeatureStore` to class declaration
3. Add `claim(projectPath, featureId, instanceId)` method:
   - Reads feature, sets `claimedBy: instanceId`, writes back
   - Returns `true` if successfully claimed (was unclaimed), `false` if already claimed by another
4. Add `release(projectPath, featureId)` method:
   - Reads feature, removes `claimedBy`, writes back
5. Ensure all existing method signatures match the interface

**Important:** Run `npm run build:packages` FIRST since types changed in M1, THEN `npm run build:server`.

### Files to modify
- `apps/server/src/services/feature-loader.ts`

### Acceptance criteria
- FeatureLoader class implements FeatureStore
- `claim()` sets claimedBy field atomically
- `release()` clears claimedBy field
- TypeScript compiles with no errors
- All existing FeatureLoader tests pass
- `npm run test:server` passes

---

## Phase 2: EventEmitter implements EventBus

**Complexity:** medium

Update `createEventEmitter()` to return an object that conforms to the `EventBus` interface.

### What to build

1. Import `EventBus`, `EventSubscription` from `@automaker/types`
2. Add `broadcast()` method (alias for `emit` — same behavior for local, will differ in distributed)
3. Change `subscribe()` to return `EventSubscription` with `unsubscribe()` method instead of the current cleanup callback pattern
4. Ensure return type satisfies `EventBus`
5. **Backward compatible:** If current consumers use the cleanup callback pattern, keep both working

**Important:** Run `npm run build:packages` FIRST since types changed in M1.

### Files to modify
- `apps/server/src/lib/events.ts`

### Acceptance criteria
- `createEventEmitter()` return type satisfies EventBus
- `broadcast()` method works (delegates to emit)
- `subscribe()` returns EventSubscription with unsubscribe()
- TypeScript compiles with no errors
- All existing event-related tests pass
- `npm run test:server` passes
