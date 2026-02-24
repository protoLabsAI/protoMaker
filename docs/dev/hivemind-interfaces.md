# Hivemind Interface Extraction

Interface abstractions that decouple protoLabs's core services from their concrete implementations, enabling the future hivemind multi-instance architecture.

## Overview

The hivemind architecture requires pluggable backends for storage, events, and identity. This extraction introduces three interface boundaries:

| Interface          | Concrete Implementation                | Future Hivemind Implementation        |
| ------------------ | -------------------------------------- | ------------------------------------- |
| `FeatureStore`     | `FeatureLoader` (filesystem JSON)      | Distributed store (HTTP mesh)         |
| `EventBus`         | `createEventEmitter()` (in-memory Set) | Mesh-aware transport (HTTP broadcast) |
| `InstanceIdentity` | N/A (single instance)                  | Per-instance ID + domain ownership    |

All interfaces live in `@protolabs-ai/types` so any package can depend on the abstractions without pulling in server code.

## FeatureStore

**File:** `libs/types/src/feature-store.ts`

Pluggable storage abstraction for feature CRUD plus distributed ownership.

```typescript
import type { FeatureStore } from '@protolabs-ai/types';
```

### Methods

| Method                                      | Description                                                    |
| ------------------------------------------- | -------------------------------------------------------------- |
| `getAll(projectPath)`                       | List all features                                              |
| `get(projectPath, featureId)`               | Get single feature                                             |
| `findByTitle(projectPath, title)`           | Lookup by title                                                |
| `create(projectPath, data)`                 | Create feature                                                 |
| `update(projectPath, featureId, updates)`   | Update feature                                                 |
| `delete(projectPath, featureId)`            | Delete feature                                                 |
| `claim(projectPath, featureId, instanceId)` | Claim ownership (returns false if claimed by another instance) |
| `release(projectPath, featureId)`           | Release ownership                                              |

### Claim/Release Semantics

- `claim()` is idempotent for the same instance — re-claiming succeeds
- `claim()` returns `false` if another instance already owns the feature
- `release()` clears `claimedBy`, allowing any instance to claim next
- Non-existent features return `false` from `claim()`

### Current Implementation

`FeatureLoader` (`apps/server/src/services/feature-loader.ts`) implements `FeatureStore` using filesystem JSON files. The `claim()` and `release()` methods write to the feature's `claimedBy` field.

## EventBus

**File:** `libs/types/src/event-bus.ts`

Pluggable event transport abstraction.

```typescript
import type { EventBus, EventSubscription } from '@protolabs-ai/types';
```

### Methods

| Method                     | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `emit(type, payload)`      | Emit to local subscribers                                              |
| `subscribe(callback)`      | Subscribe to all events, returns `EventSubscription`                   |
| `broadcast(type, payload)` | Emit locally + publish to mesh (in single-instance mode, same as emit) |

### EventSubscription

```typescript
interface EventSubscription {
  unsubscribe(): void;
}
```

The current `createEventEmitter()` returns a dual-compatible subscription: callable as a function (legacy pattern) AND has `.unsubscribe()` method (new pattern). Both work for cleanup.

### Current Implementation

`createEventEmitter()` (`apps/server/src/lib/events.ts`) implements `EventBus` with an in-memory `Set<EventCallback>`. Error isolation ensures one bad subscriber doesn't crash others.

## Hivemind Types

**File:** `libs/types/src/hivemind.ts`

Types for multi-instance mesh coordination. Not yet implemented — these define the target architecture.

| Type               | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `InstanceIdentity` | Instance ID, name, domains, capacity             |
| `HivemindPeer`     | Peer connection info (URL, status, heartbeat)    |
| `HivemindDomain`   | Domain ownership (name, file patterns, instance) |
| `HivemindConfig`   | Mesh configuration (enabled, peers, domains)     |
| `InstanceCapacity` | Concurrency limits and current load              |

## Feature Fields

Two fields added to the `Feature` type for hivemind support:

```typescript
interface Feature {
  // ... existing fields
  domain?: string; // Hivemind domain assignment (e.g., "frontend", "api")
  claimedBy?: string; // Instance ID that owns this feature
}
```

## Settings Fields

Two fields added to `GlobalSettings`:

```typescript
interface GlobalSettings {
  // ... existing fields
  instanceId?: string; // Unique ID for this instance
  hivemind?: import('./hivemind').HivemindConfig; // Mesh configuration
}
```

## Contract Tests

Interface conformance is verified by contract tests:

- `tests/unit/services/feature-store-interface.test.ts` — FeatureStore (8 tests)
- `tests/unit/lib/event-bus-interface.test.ts` — EventBus (8 tests)

These tests verify:

1. Type-level conformance (compile-time assignment check)
2. All required methods exist
3. Behavioral contracts (claim/release semantics, broadcast, subscribe/unsubscribe, error isolation)

## Migration Path

This extraction is fully backward compatible:

1. **No callers change** — `FeatureLoader` and `createEventEmitter()` keep their existing APIs
2. **New consumers** can program against `FeatureStore` / `EventBus` interfaces
3. **Hivemind Phase 1** will add alternative implementations behind these interfaces
4. **Dependency injection** at the service layer will swap implementations based on `hivemind.enabled`
