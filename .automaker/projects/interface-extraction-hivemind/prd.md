# Interface Extraction for Hivemind — SPARC PRD

## Situation

Automaker's core services (FeatureLoader, EventEmitter, settings) are concrete implementations with no interface abstraction. FeatureLoader has 44+ direct callers. EventEmitter has 50+ services calling `.emit()` directly. CopilotKit just landed as a sidecar integration that bypasses these services entirely. hiveMind (multi-instance mesh) needs these to be pluggable. Every day we add more callers, the extraction gets harder.

## Problem

1. **FeatureLoader** is a class with file I/O baked in — no repository pattern, no interface. Swapping to SQLite/network store requires touching 44+ call sites.
2. **EventEmitter** is a simple pub/sub with no interface — swapping to NATS/Redis requires rewriting 50+ services.
3. **No InstanceIdentity concept** — each Automaker instance has no awareness of itself or peers.
4. **Feature type has no domain field** for routing work between instances.

## Approach

Extract TypeScript interfaces without changing runtime behavior:

- `FeatureStore` interface from `FeatureLoader` (read, write, list, claim, release)
- `EventBus` interface from `EventEmitter` (emit, subscribe, unsubscribe, broadcast)
- `InstanceIdentity` type (id, url, capacity, domains)
- `HivemindDomain` type (name, paths, instanceId)
- Add optional `domain` field to Feature interface
- Add optional `instanceId` to Settings

Current implementations continue working — they just now implement the new interfaces.

## Results

1. `FeatureStore` interface exported from `@automaker/types`
2. `EventBus` interface exported from `@automaker/types`
3. `InstanceIdentity` and `HivemindDomain` types exported
4. Feature type gains optional `domain` field
5. Settings gains optional `instanceId` field
6. All existing tests pass unchanged
7. Contract tests verify interface conformance

## Constraints

- Zero runtime behavior change
- All existing tests must pass
- No new dependencies
- No caller changes required — callers can still use concrete classes
- Interfaces exported from `@automaker/types`
