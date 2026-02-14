# Milestone 3: Validation and Documentation

Contract tests and architecture documentation.

**Depends on:** Milestone 2 (Implementation Conformance)

## Phase 1: Interface contract tests

**Complexity:** small

Vitest tests verifying FeatureStore and EventBus interface conformance.

### What to build

**`apps/server/tests/unit/services/feature-store-interface.test.ts`:**
- Type-level test: `FeatureLoader` satisfies `FeatureStore`
- `claim()`: creates feature, claims it, verify claimedBy set
- `claim()`: already claimed by another → returns false
- `release()`: claimed feature, release, verify claimedBy cleared
- `getByStatus()`: returns correct subset

**`apps/server/tests/unit/lib/event-bus-interface.test.ts`:**
- Type-level test: return of `createEventEmitter()` satisfies `EventBus`
- `broadcast()`: emits to all subscribers
- `subscribe()` returns EventSubscription
- `unsubscribe()`: callback no longer fires after unsubscribe

### Files to modify
- `apps/server/tests/unit/services/feature-store-interface.test.ts` (new)
- `apps/server/tests/unit/lib/event-bus-interface.test.ts` (new)

### Acceptance criteria
- All contract tests pass
- `npm run test:server` passes

---

## Phase 2: Hivemind interfaces documentation

**Complexity:** small

Create architecture doc for the new interfaces.

### What to build

**`docs/dev/hivemind-interfaces.md`:**

1. **Overview** — Why these interfaces exist, how they enable hivemind
2. **FeatureStore interface** — Method signatures, semantics, current implementation
3. **EventBus interface** — Method signatures, local vs distributed behavior
4. **InstanceIdentity types** — Fields, usage, domain model
5. **Migration guide** — How to swap backends:
   - Filesystem → SQLite (same machine)
   - SQLite → Postgres (multi-machine)
   - Local EventBus → NATS EventBus
6. **Domain ownership model** — Brief summary linking to hiveMind PRD

### Files to modify
- `docs/dev/hivemind-interfaces.md` (new)

### Acceptance criteria
- Covers all three interfaces/types
- Migration guide section included
- Under 400 lines
- Follows `docs/dev/docs-standard.md` conventions
