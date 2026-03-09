# Distributed Sync

How protoLabs synchronizes state across multiple instances using Automerge CRDTs, partition detection, reconnection resilience, and fleet-wide feature scheduling.

## Architecture Overview

protoLabs uses a two-layer WebSocket sync mesh when hivemind mode is enabled:

| Layer                | Service                         | Port                 | Purpose                                          |
| -------------------- | ------------------------------- | -------------------- | ------------------------------------------------ |
| **Sync mesh**        | `CrdtSyncService`               | `:4444` (default)    | Peer heartbeat, leader election, event broadcast |
| **CRDT binary sync** | `CRDTStore` (crdt-store.module) | `:4445` (syncPort+1) | Automerge binary protocol for document state     |

One instance acts as **primary** and others connect as **workers**. All instances exchange CRDT changes (feature events, project events, settings) in real time.

```
Worker A ──────┐
               ▼
Worker B ────▶ Primary (:4444 CrdtSyncService / :4445 CRDTStore)
               ▲
Worker C ──────┘
```

Fleet coordination (work assignment, capacity advertising, escalations, scheduling) is layered on top via the Ava Channel — a daily-sharded CRDT document that all instances write to and the `AvaChannelReactorService` subscribes to.

### Layered Services

The distributed system is composed of interconnected services, each building on the layer below:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AvaChannelReactorService                          │  ← Reactive orchestrator
│                    (classifier chain, loop prevention, DORA)         │
├─────────────────────────────────────────────────────────────────────┤
│                    FleetSchedulerService                             │  ← Feature + phase scheduling
│            (schedule_assignment, failover, conflict resolution)      │
├─────────────────────────────────────────────────────────────────────┤
│  AvaChannelService  CalendarService  TodoService                     │  ← Document services (CRDT-injected)
├─────────────────────────────────────────────────────────────────────┤
│               CRDTStore (crdt-store.module)                         │  ← Automerge document persistence
├─────────────────────────────────────────────────────────────────────┤
│               CrdtSyncService (:4444)                               │  ← Peer mesh + leader election
└─────────────────────────────────────────────────────────────────────┘
```

Instance roles are set in `proto.config.yaml`:

```yaml
protolab:
  role: primary # or: worker
  syncPort: 4444
  instanceId: prod-01
  instanceUrl: ws://100.x.x.x:4444

hivemind:
  heartbeatIntervalMs: 30000
  peerTtlMs: 120000
  peers:
    - ws://100.64.0.1:4444 # primary (index 0 = highest priority)
    - ws://100.64.0.2:4444 # worker-1
    - ws://100.64.0.3:4444 # worker-2
```

## CRDT Store and Service Injection

`crdt-store.module.ts` initializes the `CRDTStore` (Automerge document persistence) when hivemind mode is enabled, then injects the store into three services via their `setCrdtStore()` hook:

- `AvaChannelService` — daily-sharded coordination messages
- `CalendarService` — shared calendar events synced under `doc:calendar/shared`
- `TodoService` — shared todo workspace synced under `doc:todos/workspace`

Features and projects do **not** use the CRDT store directly; they rely on EventBus-based sync handled by `crdt-sync.module.ts`.

## Registry Sync (Split-Brain Prevention)

When a worker reconnects to the primary, the primary immediately sends a `registry_sync` message containing its entire CRDTStore document registry (a map of `"domain:id"` → storage URL). The worker merges this registry into its local `CRDTStore` via `adoptRemoteRegistry()`, resolving cases where both instances independently created Automerge documents for the same `domain:id` with different URLs.

This is wired in `crdt-store.module.ts`:

- **Primary**: calls `crdtSyncService.setRegistryProvider(() => store.getRegistry())`.
- **Worker**: calls `crdtSyncService.onRegistryReceived((remoteRegistry) => store.adoptRemoteRegistry(remoteRegistry))`.

The `adoptRemoteRegistry()` call returns `{ adopted, conflicts }` counts that are logged. No manual wiring is needed beyond the module bootstrap order — `crdt-store.module` must register before `ava-channel-reactor.module`.

## Ava Channel Reactor

`AvaChannelReactorService` is the reactive orchestrator for multi-instance coordination. It subscribes to the CRDT-backed daily-sharded Ava Channel (`doc:ava-channel/YYYY-MM-DD`), detects new messages, and dispatches responses with three-layer loop prevention:

1. **Classifier chain** — configurable `MessageClassifierRule[]` rules (regex + source filter) determine `MessageIntent`. Messages with intent `inform` or `system_alert` from other instances are typically suppressed.
2. **Per-thread cooldown** — configurable `threadCooldownMs` prevents responding twice to the same thread within the window.
3. **Busy gate** — a `processingMessage` flag serializes responses to prevent overlapping work on a single instance.

Self-healing: on subscription failure, the reactor retries with exponential backoff (5 s base, 60 s cap).

### Enabling the Reactor

The reactor requires **both** conditions:

1. `hivemind.enabled: true` in `proto.config.yaml`
2. `featureFlags.reactorEnabled: true` in global settings (checked via `SettingsService.getGlobalSettings()`)

The reactor is started by `ava-channel-reactor.module.ts`, which must run after `crdt-store.module` so `container._crdtStore` is available.

### Bug Report Forwarding

`CrdtSyncService.attachAvaChannelBugReporter(callback)` registers a callback that is invoked whenever a `bug:reported` event fires on the attached `EventBus`. The callback receives `(content: string, featureId?: string)` and posts the report to the Ava Channel as a system message. This wires the internal event bus to the CRDT-backed channel without additional module coupling.

## Fleet Scheduler

`FleetSchedulerService` handles fleet-level feature distribution and project phase scheduling. It runs inside `ava-channel-reactor.module` alongside the reactor.

### Role

- **Primary** (`role: primary` in `proto.config.yaml`): starts as the active scheduler immediately.
- **Worker**: waits for failover. If the primary's `scheduler_heartbeat` is absent for >10 minutes, the longest-running worker (by uptime) takes over scheduling. Tiebreaker: lower `instanceId` (lexicographic) wins.

### Schedule Cycle

Every 5 minutes the active scheduler:

1. Collects live `work_inventory` snapshots from all peers (TTL = 6 minutes).
2. Computes an assignment: unassigned backlog features (dependency order) are distributed to instances with spare capacity (`maxConcurrency - activeCount`).
3. Broadcasts a `schedule_assignment` message; each instance applies its own slice.

### Conflict Resolution

When two instances both claim the same feature, the detecting instance broadcasts a `schedule_conflict`. The instance with the **higher** `instanceId` (lexicographic) releases the claim and sets the feature back to `backlog`.

### Project Phase Distribution

When a new project is created, the active scheduler distributes its milestone phases across fleet instances:

1. Phases are grouped into parallel waves using Kahn's BFS (topological sort on the dependency DAG).
2. Parallel waves are distributed round-robin across available instances.
3. A `schedule_assignment` is broadcast encoding phase identifiers as `projectSlug/milestoneSlug/phaseName` strings.

### Project Fleet Status API

`GET /api/projects/:slug/fleet-status` returns the aggregated phase progress for a project:

```json
{
  "success": true,
  "projectSlug": "my-project",
  "phases": [
    {
      "milestoneSlug": "m1",
      "phaseName": "implementation",
      "instanceId": "prod-01",
      "status": "done",
      "timestamp": "2026-03-09T10:00:00.000Z"
    }
  ]
}
```

Phases are broadcast via `project_progress` messages and aggregated in-memory on every instance. The last-writer-wins (by `timestamp`) for each `projectSlug:milestoneSlug:phaseName` key.

## Sync Health Metrics

Sync health is exposed at `GET /api/health/detailed` under the `sync` key:

```json
{
  "sync": {
    "role": "worker",
    "syncPort": null,
    "connected": true,
    "peerCount": 2,
    "onlinePeers": [...],
    "isLeader": false,
    "peerCapacitySummary": [...],
    "partitionSince": null,
    "queuedChanges": 0,
    "compactionDiagnostics": {
      "lastCompactionAt": "2026-03-07T12:00:00.000Z",
      "totalSizeBytes": 204800,
      "alertCount": 0
    }
  }
}
```

| Field                   | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `role`                  | `primary` or `worker`                               |
| `connected`             | Whether this instance is connected to the sync mesh |
| `partitionSince`        | ISO timestamp when connectivity was lost, or `null` |
| `queuedChanges`         | Number of changes buffered while disconnected       |
| `compactionDiagnostics` | CRDT document size summary (see Compaction section) |

## Partition Detection and UI Indicator

When a worker loses its connection to the primary, the service records `partitionSince` (ISO timestamp). This field is returned in `/api/health/detailed` and surfaces in the UI as:

> **Sync disconnected since [time]**

The partition is detected via WebSocket `close` and `error` events. The service immediately begins reconnecting (5-second intervals) while buffering outbound change events in memory.

### Partition Recovery

When the connection is restored:

1. All buffered changes are replayed to the primary in order.
2. `partitionSince` is cleared to `null`.
3. A `sync:partition-recovered` event fires on the internal event bus, prompting the feature loader to check for dual-claimed features (features marked `in_progress` by more than one instance).

Dual-claimed features are resolved by instance priority: the instance with the lower index in `hivemind.peers` takes ownership. The other instance releases the feature back to `backlog`.

## Peer TTL and Unreachability Alerts

The TTL checker runs every 10 seconds. If a peer has not sent a heartbeat within `peerTtlMs` (default 120 seconds), the service:

1. Marks the peer `offline` in the peer registry.
2. Emits a `sync:peer-unreachable` event on the event bus with `{ instanceId, lastSeen, peerTtlMs }`.
3. Logs a warning: `ALERT: Peer <id> unreachable for >120000ms`.

## Leader Election

If a worker cannot reach the primary and the TTL has expired, it checks whether any higher-priority peer (lower index in `hivemind.peers`) is online. If none is found, the worker promotes itself:

1. Announces the promotion to any connected workers via a `promote` message.
2. Starts a WebSocket server on `syncPort`.
3. Workers receive the promotion message and reconnect to the new primary.

## Compaction Diagnostics

`MaintenanceTracker` (in `libs/crdt/src/maintenance.ts`) records size data after each compaction pass and fires alerts when a document exceeds the threshold.

### How to Wire It

```typescript
import { MaintenanceTracker } from '@protolabsai/crdt';

const tracker = new MaintenanceTracker({ alertThresholdBytes: 10 * 1024 * 1024 });

// After each CRDTStore.compact() call:
const sizeMap = store.getDocumentSizes(); // Record<string, number>
tracker.recordCompaction(sizeMap);

// Expose to health endpoint:
crdtSyncService.setCompactionDiagnosticsProvider(() => {
  const diag = tracker.getDiagnostics();
  return {
    lastCompactionAt: diag.lastCompaction?.timestamp ?? null,
    totalSizeBytes: diag.totalSizeBytes,
    alertCount: diag.alerts.length,
  };
});
```

### Diagnostics Object

```typescript
interface CompactionDiagnostics {
  lastCompaction: {
    timestamp: string;
    docCount: number;
    totalSizeBytes: number;
    docSizeMap: Record<string, number>; // "domain:id" -> bytes
  } | null;
  history: CompactionRecord[]; // Rolling 20-entry history
  totalSizeBytes: number;
  alerts: CompactionAlert[]; // Unacknowledged threshold violations
}
```

Acknowledge alerts after operator review:

```typescript
tracker.clearAlerts();
```

## Time-Travel Debugging with Automerge.getHistory

Every Automerge document retains its full change history. Use `Automerge.getHistory(doc)` for time-travel debugging in distributed incidents:

```typescript
import * as Automerge from '@automerge/automerge';

const handle = store.getHandle('features', featureId);
const doc = handle.doc();

const history = Automerge.getHistory(doc);
// history: Array<{ change: Change; snapshot: Doc }>

for (const entry of history) {
  console.log(entry.change.hash, entry.change.timestamp, entry.snapshot);
}
```

Each entry includes:

- `change.hash` — unique change identifier
- `change.timestamp` — wall clock time at the originating instance
- `change.actor` — `instanceId` of the authoring instance (from CRDT actor ID)
- `snapshot` — the full document state after this change was applied

This is useful for diagnosing merge conflicts, identifying the source of unexpected state, and reconstructing the sequence of events during a network partition.

## Fleet Coordination via Ava Channel

While the CRDT sync mesh handles state replication, **fleet coordination** (which instance works on which features) is handled through the **Ava Channel** — a daily-sharded CRDT document (`doc:ava-channel/YYYY-MM-DD`) that all instances read and write. The `AvaChannelReactorService` subscribes to this document and dispatches coordination messages.

The reactor is activated by `ava-channel-reactor.module.ts`, which requires **all three** conditions to be met:

1. The `reactorEnabled` feature flag is `true` in global settings.
2. `proto.config.yaml` exists with `hivemind.enabled: true`.
3. The `CRDTStore` has been registered by `crdt-store.module` (i.e. `crdt-store.module` must run first).

The `FleetSchedulerService` is instantiated and started inside the same module registration and shares the same lifecycle.

### Ava Channel Document

Each message in the Ava Channel has:

```typescript
interface AvaChatMessage {
  id: string;
  instanceId: string;
  instanceName: string;
  content: string;
  context?: AvaChannelContext; // optional machine-readable metadata
  source: 'ava' | 'operator' | 'system';
  timestamp: string; // ISO 8601
  intent?: MessageIntent; // request | inform | response | coordination | escalation | system_alert
  inReplyTo?: string; // ID of the parent message in a thread
  expectsResponse?: boolean;
  conversationDepth?: number;
}
```

`AvaChannelContext` carries optional structured metadata alongside the free-form `content`:

```typescript
interface AvaChannelContext {
  featureId?: string;
  boardSummary?: string;
  capacity?: { runningAgents: number; maxAgents: number; backlogCount: number };
}
```

The reactor classifies incoming messages via a rule chain of `MessageClassifierRule` patterns and dispatches appropriate responses. Loop prevention is enforced at three layers: (1) classifier chain (`shouldRespond` result), (2) per-thread cooldown timer, and (3) a busy gate that queues one pending message while a response is in-flight.

**Protocol message filtering**: Messages with `source='system'` that start with a `[bracket_prefix]` (e.g. `[capacity_heartbeat]`, `[work_request]`, `[schedule_assignment]`, `[dora_report]`) are intercepted by `handleWorkStealProtocol()` before reaching the classifier chain. These machine-to-machine protocol messages are dispatched directly to their typed handlers and never generate a classifier response.

### Work-Stealing Protocol

When a fleet instance finishes its assigned features and has spare capacity, it advertises itself and requests more work:

1. Every 60s, each reactor broadcasts a `CapacityHeartbeat` with its current load.
2. An idle instance posts a `WorkRequest` (requesting up to 2 features).
3. The primary (or any instance with spare inventory) responds with a `WorkOffer`.
4. The requesting instance accepts the offer and begins work.

This allows the fleet to self-balance without any centralized coordinator — any instance can fulfill a `WorkRequest`. Epics are excluded from work-stealing; only leaf features are eligible.

### Escalation Protocol (Blocked Feature Handoff)

When an instance is blocked on a feature (e.g., waiting for a human decision) and cannot make progress:

1. The blocked instance posts an `EscalationRequest` to the Ava Channel.
2. Any instance with capacity responds with an `EscalationOffer`.
3. The blocked instance replies with `EscalationAccept`, transferring ownership.
4. The accepting instance takes over the feature from its current state.

This prevents features from stalling when an individual instance is stuck.

### Health Alerts

Each instance monitors its own resource usage and posts `HealthAlert` messages when thresholds are exceeded (memory > 85%, CPU > 90%):

```typescript
interface HealthAlert {
  instanceId: string;
  memoryUsed: number; // percentage 0–100
  cpuLoad: number; // percentage 0–100
  alertTimestamp: string; // ISO 8601
}
```

Peers that receive a `HealthAlert` pause work-stealing from the degraded instance for 5 minutes.

### Self-Healing Subscription

`AvaChannelReactorService` uses exponential backoff on subscription failure: 5-second base delay, capped at 60 seconds. If the daily-sharded document is unavailable at startup, the reactor retries automatically without manual intervention.

## Fleet Scheduler

`FleetSchedulerService` is a higher-level scheduler that distributes **project phases** across fleet instances. It runs on top of the Ava Channel and handles parallel execution of independent work. Epics are excluded from fleet scheduling; only concrete features are assigned.

### How It Works

1. **Inventory Broadcast**: Every instance periodically posts a `[work_inventory]` message describing its current backlog and active features (in dependency order).
2. **Schedule Assignment**: The active scheduler runs `runScheduleCycle()` every 5 minutes, computing an optimal assignment of features to instances. It posts a `[schedule_assignment]` message mapping `instanceId → featureIds[]`.
3. **Failover**: If no `[scheduler_heartbeat]` is received within 10 minutes, the longest-running worker instance takes over as active scheduler (last-writer-wins on uptime, with lower `instanceId` as tiebreaker).
4. **Conflict Resolution**: If two instances both claim the same feature, a `[schedule_conflict]` is broadcast. The instance with the **higher** `instanceId` (lexicographic) releases the claim and moves the feature back to backlog.

### Phase Parallelization

When a new project is created, the fleet scheduler decomposes it into phases using a topological sort (Kahn's BFS). Independent phases are grouped and dispatched to separate instances simultaneously:

```
Phase 1 (setup)
    ├── Phase 2a (feature-A)  → Instance prod-01
    ├── Phase 2b (feature-B)  → Instance prod-02
    └── Phase 2c (feature-C)  → Instance prod-03
Phase 3 (integration) — starts after all Phase 2 complete
```

Progress is tracked via `ProjectProgressMsg`, which each instance posts when it completes a phase. The scheduler waits for all parallel phases to complete before unblocking dependent phases.

### Fleet Status API

```
GET /api/projects/:slug/fleet-status
```

Returns the aggregated execution status of a project across all fleet instances:

```json
{
  "projectSlug": "my-project",
  "phases": [
    {
      "milestoneSlug": "milestone-1",
      "phaseName": "feature-A",
      "status": "done",
      "instanceId": "prod-01",
      "timestamp": "2026-03-09T10:00:00.000Z"
    },
    {
      "milestoneSlug": "milestone-1",
      "phaseName": "feature-B",
      "status": "in_progress",
      "instanceId": "prod-02",
      "timestamp": "2026-03-09T10:05:00.000Z"
    }
  ]
}
```

This endpoint is backed by `FleetSchedulerService.getProjectFleetStatus()`, which aggregates `ProjectProgress` (a.k.a. `ProjectProgressMsg`) entries received via the Ava Channel and stored in the in-memory `projectProgressByPhase` map.

### Fleet Scheduler Message Types

| Message Type            | Frequency    | Purpose                                        |
| ----------------------- | ------------ | ---------------------------------------------- |
| `WorkInventoryMsg`      | Per instance | Broadcast backlog + active features            |
| `ScheduleAssignmentMsg` | Every 5 min  | Primary assigns features to instances          |
| `SchedulerHeartbeatMsg` | Every 1 min  | Failover detection (absent >10 min = takeover) |
| `ScheduleConflictMsg`   | On conflict  | Resolve double-claims (lower instanceId wins)  |
| `ProjectProgressMsg`    | Per phase    | Track phase completion across instances        |

### Key Timing Constants

| Constant                 | Value      | Purpose                                       |
| ------------------------ | ---------- | --------------------------------------------- |
| Peer inventory TTL       | 6 minutes  | Stale inventory is ignored in schedule cycles |
| Primary absent threshold | 10 minutes | No heartbeat for 10 min triggers failover     |
| Schedule cycle interval  | 5 minutes  | How often the primary recomputes assignments  |
| Scheduler heartbeat      | 1 minute   | Proves primary is still running the scheduler |

## Observability: DORA Metrics and Friction Tracking

`AvaChannelReactorService` also posts higher-level operational signals:

- **`DoraReport`**: Deployment frequency, lead time, and blocked feature count. Broadcast as a `[dora_report]` system message **every hour**. Peers merge incoming reports into the aggregate CRDT entry under `domain='metrics', id='dora'`.
- **`PatternResolved`**: Broadcast as a `[pattern_resolved]` system message when a System Improvement feature completes. Peers clear their local friction counters for the resolved pattern on receipt.
- **Friction Tracker**: Monitors repeated failures via `FrictionTrackerService`. When the same failure pattern recurs, a System Improvement feature is automatically filed. Incoming `[friction_report]` messages from peers are used for de-duplication.

These signals are visible in the Ava Channel for fleet-wide visibility and can be consumed by the metrics dashboard.

## Sync Events

### EventBus events (internal)

| Event                      | Payload                               | Description                                                      |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `sync:partition-recovered` | `{ instanceId, partitionDurationMs }` | Emitted after a network partition heals and changes are replayed |
| `sync:peer-unreachable`    | `{ instanceId, lastSeen, peerTtlMs }` | Emitted when a peer exceeds its TTL                              |
| `bug:reported`             | `{ content, featureId? }`             | Triggers Ava Channel bug report forwarding (if wired)            |

These events are emitted on the internal `EventEmitter` passed to `crdtSyncService.attachEventBus()`.

### Ava Channel coordination messages (wire protocol)

Messages are posted as free-form strings with a `[type]` prefix so the reactor classifier can route them without a message-type enum.

| Message prefix          | Type                 | Description                                                |
| ----------------------- | -------------------- | ---------------------------------------------------------- |
| `[work_inventory]`      | `WorkInventory`      | Per-instance backlog + active feature snapshot             |
| `[schedule_assignment]` | `ScheduleAssignment` | Primary → all workers: feature or phase assignments        |
| `[scheduler_heartbeat]` | `SchedulerHeartbeat` | Active scheduler liveness (every 60 s, failover detection) |
| `[schedule_conflict]`   | `ScheduleConflict`   | Conflict broadcast: two instances claimed the same feature |
| `[project_progress]`    | `ProjectProgress`    | Phase status update (`in_progress` / `done` / `failed`)    |
| `[capacity_heartbeat]`  | `CapacityHeartbeat`  | Per-instance CPU/memory/agent capacity broadcast (60 s)    |
| `[work_request]`        | `WorkRequest`        | Idle instance requests features from a peer with backlog   |
| `[work_offer]`          | `WorkOffer`          | Peer offers features in response to a work_request         |
| `[escalation_request]`  | `EscalationRequest`  | Feature blocked (failCount ≥ 2) — requesting new owner     |
| `[escalation_offer]`    | `EscalationOffer`    | Peer offers to take ownership of escalated feature         |
| `[escalation_accept]`   | `EscalationAccept`   | Originator accepts offer; delegates ownership              |
| `[health_alert]`        | `HealthAlert`        | Memory/CPU threshold exceeded — peers pause work-stealing  |
| `[dora_report]`         | `DoraReport`         | Hourly DORA metrics broadcast                              |
| `[pattern_resolved]`    | `PatternResolved`    | System Improvement done — peers clear friction counters    |

All message types are defined in `libs/types/src/ava-channel.ts`.

## CRDTStore Module

`crdt-store.module.ts` is the second initialization layer, starting after `CrdtSyncService`. It provides Automerge document persistence and injects the store into higher-level services.

### Initialization Flow

1. Reads `proto.config.yaml` for role and port configuration.
2. Checks `hivemind.enabled` — returns `null` in single-instance mode.
3. Instantiates `CRDTStore` with storage at `{projectRoot}/.automaker/crdt`.
4. If `role: primary`, starts a WebSocket server on port `syncPort + 1` (default **:4445**) for Automerge binary sync.
5. **Registry sync**: primary broadcasts its full document registry to workers on connect, preventing split-brain from independent document creation.
6. Injects store into `AvaChannelService`, `CalendarService`, and `TodoService`.

### Document Key Format

CRDT documents follow the pattern `{domain}:{id}`:

| Domain            | Example Key                  | Service           |
| ----------------- | ---------------------------- | ----------------- |
| `doc:ava-channel` | `doc:ava-channel/2026-03-09` | AvaChannelService |
| `todos`           | `todos:workspace`            | TodoService       |
| `calendar`        | varies per workspace         | CalendarService   |

## CRDT-Injected Document Services

Three services support dual-mode operation: CRDT-backed when a store is available, filesystem fallback otherwise.

### AvaChannelService

Daily-sharded append-only message store for multi-instance Ava coordination.

- **Document key**: `doc:ava-channel/YYYY-MM-DD` (new shard each day)
- **CRDT mode**: messages appended via `store.change<AvaChannelDocument>()`
- **Fallback**: in-memory `Map<date, AvaChatMessage[]>`
- **Archive**: shards older than 30 days are written to `{archiveDir}/{YYYY-MM-DD}.json` and removed from CRDT storage
- **Injection**: `AvaChannelService.setCrdtStore(store)` called by crdt-store.module

**Message fields** (`AvaChatMessage`):

| Field               | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `instanceId`        | Originating instance                                                          |
| `intent`            | `request \| inform \| response \| coordination \| escalation \| system_alert` |
| `inReplyTo`         | Parent message id for threading                                               |
| `conversationDepth` | Recursion guard (capped to prevent runaway loops)                             |
| `expectsResponse`   | Whether a reply is expected                                                   |

### CalendarService

Manages calendar events with optional CRDT sync for cross-instance visibility.

- **Dual-mode**: CRDT when store injected, else `{projectPath}/.automaker/calendar.json`
- **Injection**: `CalendarService.getInstance().setCrdtStore(store)`
- **Feature aggregation**: feature `dueDate` fields surfaced as read-only calendar entries (aggregated on demand, not cached)
- **Job scheduling**: events with `type: 'job'` and `jobStatus: 'pending'` are queryable via `getDueJobs()`

### TodoService

Per-project todo lists with tiered write permissions.

- **Dual-mode**: CRDT via `todos:workspace` document, else `{projectPath}/.automaker/todos/workspace.json`
- **Injection**: `TodoService.getInstance().setCrdtStore(store)`
- **Permission tiers**:
  - `user` — user writes; Ava reads only
  - `ava-instance` — owning instance + user write; other Ava instances cannot
  - `shared` — any caller reads/writes
- **Auto-provisioning**: `ensureAvaInstanceList()` creates a per-instance list on first Ava activation

## AvaChannelReactorService

Reactive orchestrator that subscribes to the Ava Channel and dispatches responses.

### Message Classification Chain

Each incoming message is evaluated by a classifier chain (rules evaluated in order, first match wins):

1. **Self-loop guard** — drops messages from this instance
2. **Thread cooldown** — per-thread 30s cooldown prevents rapid reply loops
3. **Busy gate** — drops new requests while already processing
4. **Intent classifiers** — routes `request`, `inform`, `coordination`, `escalation`, `system_alert` intents

### Loop Prevention

Three independent guards prevent runaway message loops:

| Guard           | Mechanism                                              |
| --------------- | ------------------------------------------------------ |
| Self-loop       | `message.instanceId === this.instanceId` → skip        |
| Thread cooldown | `replyTimestamps[threadId]` checked against 30s window |
| Busy gate       | `processing` flag set during response generation       |
| Depth cap       | `conversationDepth` incremented and capped per message |

### Self-Healing

On subscription failure the reactor implements exponential backoff:

- Base delay: 5 seconds
- Max delay: 60 seconds
- Retries indefinitely until `stop()` is called

### Fleet Integration

The reactor delegates fleet-level operations to `FleetSchedulerService`:

- Work-steal requests → `WorkRequest` / `WorkOffer` protocol
- Escalation → `EscalationRequest` / `EscalationAccept` protocol
- Project progress → `ProjectProgress` broadcast

### Module Initialization (`ava-channel-reactor.module.ts`)

The reactor only starts when all three conditions are met:

1. `proto.config.yaml` exists
2. `hivemind.enabled: true`
3. `reactorEnabled` feature flag is active

Depends on `crdt-store.module` completing first — the `CRDTStore` must already be in the container.

## FleetSchedulerService

Primary-elected scheduler that distributes features across fleet instances.

### Scheduling Cycle (every 5 minutes)

1. Each instance broadcasts `WorkInventory` (backlog count, active features, capacity snapshot).
2. Primary collects inventories (6-minute TTL) and computes an optimal assignment.
3. Primary broadcasts `ScheduleAssignment` to all peers.
4. Each instance applies assignments addressed to its `instanceId`.

### Failover

If no `SchedulerHeartbeat` is received for 10 minutes, the longest-running worker self-elects as the new scheduler primary.

### Conflict Resolution

When two instances claim the same feature simultaneously:

1. Both broadcast `ScheduleConflict`.
2. The instance with the **lexicographically lower `instanceId`** retains the claim.
3. The other instance releases the feature back to `backlog`.

### Project Progress Tracking

Each instance emits `ProjectProgress` on phase status changes. The scheduler aggregates these in `projectProgressByPhase` (keyed by `{milestoneSlug}:{instanceId}`) and exposes them via `getProjectProgress()`.

### Fleet Status Endpoint

```
GET /api/projects/:slug/fleet-status
```

Returns aggregated phase statuses across all instances:

```json
{
  "success": true,
  "projectSlug": "my-project",
  "phases": [
    {
      "milestoneSlug": "v1-auth",
      "phaseName": "implementation",
      "instanceId": "prod-01",
      "status": "in_progress",
      "timestamp": "2026-03-09T10:00:00.000Z"
    }
  ]
}
```
