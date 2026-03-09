# Distributed Sync

How protoLabs synchronizes state across multiple instances using Automerge CRDTs, partition detection, reconnection resilience, and fleet-wide feature scheduling.

## Architecture Overview

protoLabs uses two parallel WebSocket layers for distributed sync:

1. **Peer mesh** (`CrdtSyncService`, port 4444) — heartbeats, peer TTL, leader election, feature/project/settings event broadcast, and registry sync.
2. **Automerge binary sync** (`CRDTStore`, port 4445) — low-level Automerge document replication for the Ava Channel, calendar events, and todos.

One instance acts as **primary** and others connect as **workers** on both ports. The ports are derived from `protolab.syncPort` in `proto.config.yaml`; the CRDT store always uses `syncPort + 1`.

```
Worker A ──────┐
               ▼
Worker B ────▶ Primary (peer mesh :4444, CRDT store :4445)
               ▲
Worker C ──────┘
```

Fleet coordination (work assignment, capacity advertising, escalations, scheduling) is layered on top via the Ava Channel — a daily-sharded CRDT document that all instances write to and the `AvaChannelReactorService` subscribes to.

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

The CRDT store uses a **registry** to track which document IDs are known to the fleet. Without this, instances that miss document creation events can end up with orphaned or diverged documents.

`CrdtSyncService` exposes two hooks:

```typescript
// Primary: provide a snapshot of all known documents (key → URL map)
crdtSyncService.setRegistryProvider(() => store.getKnownDocumentIds());

// All instances: receive and reconcile incoming registry snapshots
crdtSyncService.onRegistryReceived((registry) => {
  store.reconcileRegistry(registry);
});
```

When a worker connects (or reconnects after a partition), the primary sends its full registry snapshot. The worker reconciles any missing documents by requesting them from the primary before replaying buffered changes. This prevents split-brain where two instances believe they hold the authoritative version of the same logical document.

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

| Event                      | Payload                               | Description                                                      |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `sync:partition-recovered` | `{ instanceId, partitionDurationMs }` | Emitted after a network partition heals and changes are replayed |
| `sync:peer-unreachable`    | `{ instanceId, lastSeen, peerTtlMs }` | Emitted when a peer exceeds its TTL                              |

These events are emitted on the internal `EventEmitter` passed to `crdtSyncService.attachEventBus()`.
