# Milestone 1: Core Type Definitions

New interfaces and types in `@automaker/types`. No implementation changes.

## Phase 1: Add FeatureStore interface

**Complexity:** small

Extract a `FeatureStore` interface from FeatureLoader's public API.

### What to build

Create the interface in `libs/types/src/feature-store.ts`:

```typescript
export interface FeatureStore {
  getAll(projectPath: string): Promise<Feature[]>;
  getById(projectPath: string, featureId: string): Promise<Feature | null>;
  create(projectPath: string, feature: Partial<Feature>): Promise<Feature>;
  update(projectPath: string, featureId: string, updates: Partial<Feature>): Promise<Feature>;
  delete(projectPath: string, featureId: string): Promise<void>;
  getByStatus(projectPath: string, status: FeatureStatus): Promise<Feature[]>;
  claim(projectPath: string, featureId: string, instanceId: string): Promise<boolean>;
  release(projectPath: string, featureId: string): Promise<void>;
}
```

### Files to modify
- `libs/types/src/feature-store.ts` (new)
- `libs/types/src/index.ts` (export)

### Acceptance criteria
- FeatureStore interface exported from `@automaker/types`
- Interface methods match FeatureLoader's current public API signatures
- `npm run build:packages` succeeds
- No runtime changes

---

## Phase 2: Add EventBus interface

**Complexity:** small

Extract an `EventBus` interface from the current `createEventEmitter()` pattern.

### What to build

Create the interface in `libs/types/src/event-bus.ts`:

```typescript
export type EventCallback = (payload: unknown) => void;

export interface EventSubscription {
  unsubscribe(): void;
}

export interface EventBus {
  emit(type: string, payload?: unknown): void;
  subscribe(type: string, callback: EventCallback): EventSubscription;
  broadcast(type: string, payload?: unknown): void;
}
```

### Files to modify
- `libs/types/src/event-bus.ts` (new)
- `libs/types/src/index.ts` (export)

### Acceptance criteria
- EventBus interface exported from `@automaker/types`
- Interface methods match current EventEmitter public API
- `npm run build:packages` succeeds
- No runtime changes

---

## Phase 3: Add InstanceIdentity and HivemindDomain types

**Complexity:** small

Create new type definitions for hivemind instance identity and domain ownership.

### What to build

Create `libs/types/src/hivemind.ts`:

```typescript
export interface InstanceCapacity {
  cores: number;
  ramMb: number;
  maxAgents: number;
  runningAgents: number;
}

export interface HivemindDomain {
  name: string;
  paths: string[];
  instanceId?: string;
}

export interface InstanceIdentity {
  instanceId: string;
  url?: string;
  capacity: InstanceCapacity;
  domains: HivemindDomain[];
  lastHeartbeat?: string; // ISO timestamp
  status?: 'online' | 'offline' | 'draining';
}

export interface HivemindConfig {
  enabled: boolean;
  hiveId?: string;
  secret?: string; // hashed passphrase
  peers?: string[]; // peer URLs for manual join
  domains?: HivemindDomain[];
}
```

Add to Feature interface:
```typescript
domain?: string; // hivemind domain assignment
claimedBy?: string; // instanceId that claimed this feature
```

Add to Settings:
```typescript
instanceId?: string; // defaults to os.hostname()
hivemind?: HivemindConfig;
```

### Files to modify
- `libs/types/src/hivemind.ts` (new)
- `libs/types/src/feature.ts` (add domain + claimedBy fields)
- `libs/types/src/settings.ts` (add instanceId + hivemind config)
- `libs/types/src/index.ts` (export)

### Acceptance criteria
- All types exported from `@automaker/types`
- Feature has optional `domain` and `claimedBy` fields
- Settings has optional `instanceId` and `hivemind` fields
- `npm run build:packages` succeeds
- No runtime changes
