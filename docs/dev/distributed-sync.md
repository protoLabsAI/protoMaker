# Distributed Sync

How protoLabs synchronizes state across multiple instances using Automerge CRDTs, partition detection, and reconnection resilience.

## Architecture Overview

protoLabs uses a **dual-channel sync architecture** where each instance runs two separate WebSocket services:

| Service           | Port                          | Purpose                                                 |
| ----------------- | ----------------------------- | ------------------------------------------------------- |
| `CrdtSyncService` | `syncPort` (default 4444)     | Peer mesh: heartbeats, event broadcast, leader election |
| `CRDTStore`       | `syncPort + 1` (default 4445) | Automerge binary document replication (primary only)    |

One instance acts as **primary** and others connect as **workers**. The primary instance listens on both ports; workers connect to both.

```
                            :4444 (CrdtSyncService — event mesh)
Worker A ──────┐            ┌─── heartbeats, feature_event, settings_event
               ▼            │
Worker B ────▶ Primary ─────┤
               ▲            │
Worker C ──────┘            └─── :4445 (CRDTStore — Automerge binary sync)
                                 AvaChannel, Calendar, Todo documents
```

Instance roles are set in `proto.config.yaml`. **`hivemind.enabled` must be `true`** for distributed mode to activate; without it both services run in single-instance mode and skip all peer connections.

```yaml
protolab:
  role: primary # or: worker
  syncPort: 4444
  instanceId: prod-01
  instanceUrl: ws://100.x.x.x:4444

hivemind:
  enabled: true # REQUIRED — set false (or omit) for single-instance mode
  heartbeatIntervalMs: 30000
  peerTtlMs: 120000
  peers:
    - ws://100.64.0.1:4444 # primary (index 0 = highest priority)
    - ws://100.64.0.2:4444 # worker-1
    - ws://100.64.0.3:4444 # worker-2
```

### Services Using CRDTStore

`CrdtStoreModule` initializes the `CRDTStore` on startup and injects it into services that need document-level Automerge sync:

- `AvaChannelService` — daily-sharded coordination messages (`doc:ava-channel/YYYY-MM-DD`)
- `CalendarService` — shared calendar events (`doc:calendar/shared`)
- `TodoService` — shared todo workspace (`doc:todos/workspace`)

Features and Projects use EventBus-based sync (handled by `crdt-sync.module.ts`) because their storage is filesystem-primary with event notifications.

### TodoService Permission Model

`TodoService` enforces a three-tier write-permission model per list. Permissions are checked before any CRDT mutation:

| List type      | User can write | Ava (owning instance) can write | Ava (other instances) can write |
| -------------- | -------------- | ------------------------------- | ------------------------------- |
| `shared`       | yes            | yes                             | yes                             |
| `user`         | yes            | no (read-only)                  | no (read-only)                  |
| `ava-instance` | yes            | yes                             | no                              |

All write methods accept a `TodoWriterIdentity` (`{ isAva: boolean, instanceId?: string }`). In hivemind mode the owning Ava `instanceId` is stored in `list.ownerInstanceId` and replicated to all peers via the CRDT document.

### Storage Locations

CRDT documents are persisted to `.automaker/crdt/` relative to the repository root. The `CRDTStore` runs automatic compaction every **5 minutes** (`compactIntervalMs: 5 * 60 * 1000`).

`AvaChannelService` shards older than **30 days** are archived to disk as JSON files and unloaded from active memory.

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

## Split-Brain Prevention (Registry Sync)

When two instances independently start up before they can communicate, they may each create separate Automerge documents for the same `domain:id` pair with different internal URLs. This is a split-brain scenario.

**How it's resolved:** On every new worker connection, the primary immediately broadcasts a `registry_sync` message containing its full `CRDTStore` document registry (`Record<string, string>` mapping `domain:id` → document URL). The worker calls `store.adoptRemoteRegistry(remoteRegistry)` to overwrite any conflicting local URLs with the primary's versions.

```
Worker connects → primary sends registry_sync
                  → worker adopts primary's URLs
                  → split-brain resolved
```

This happens automatically via two wiring calls in `CrdtStoreModule`:

```typescript
// Primary side — broadcasts on each new peer identity message
crdtSyncService.setRegistryProvider(() => store.getRegistry());

// Worker side — adopts registry when received from primary
crdtSyncService.onRegistryReceived((remoteRegistry) => {
  const { adopted, conflicts } = store.adoptRemoteRegistry(remoteRegistry);
  // adopted = entries overwritten, conflicts = URL mismatches resolved
});
```

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

## Sync Events

Events emitted on the internal `EventEmitter` passed to `crdtSyncService.attachEventBus()`:

| Event                      | Payload                               | Description                                                                                               |
| -------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sync:partition-recovered` | `{ instanceId, partitionDurationMs }` | Emitted after a network partition heals and changes are replayed                                          |
| `sync:peer-unreachable`    | `{ instanceId, lastSeen, peerTtlMs }` | Emitted when a peer exceeds its TTL                                                                       |
| `bug:reported`             | `{ content, featureId? }`             | Consumed (not emitted) — forwarded to Ava Channel as a system message via `attachAvaChannelBugReporter()` |

### Wiring the Ava Channel Bug Reporter

```typescript
crdtSyncService.attachAvaChannelBugReporter(async (content, featureId) => {
  await avaChannelService.postSystemMessage(content, featureId);
});
```

When this callback is registered, any `bug:reported` event on the event bus is automatically relayed to the Ava Channel as a system message.

## Fleet Coordination via Ava Channel

While the CRDT sync mesh handles state replication, **fleet coordination** (which instance works on which features) uses the **Ava Channel** — a daily-sharded CRDT document (`doc:ava-channel/YYYY-MM-DD`) that all instances read and write. The `AvaChannelReactorService` subscribes to this document and dispatches coordination messages.

### FleetSchedulerService

`FleetSchedulerService` distributes backlog features and project phases across fleet instances:

1. **Inventory Broadcast**: Every instance periodically posts a `[work_inventory]` message with its current backlog and active features (sorted by dependency order).
2. **Schedule Assignment**: The active scheduler runs `runScheduleCycle()` every 5 minutes, computing an optimal assignment of features to instances. Posts a `[schedule_assignment]` message mapping `instanceId → featureIds[]`.
3. **Failover**: If no `[scheduler_heartbeat]` arrives within 10 minutes, the longest-running worker instance takes over as active scheduler. Tiebreaker: lower `instanceId` (lexicographic) wins.
4. **Conflict Resolution**: If two instances both claim the same feature, a `[schedule_conflict]` is broadcast. The instance with the **higher** `instanceId` releases the claim and moves the feature back to backlog.

**Phase Parallelization**: When a new project is created, the scheduler decomposes it into phases using Kahn's BFS topological sort. Independent phases are distributed across instances simultaneously; dependent phases wait for their prerequisites.

| Message Type            | Frequency    | Purpose                                         |
| ----------------------- | ------------ | ----------------------------------------------- |
| `WorkInventoryMsg`      | Per instance | Broadcast backlog + active features             |
| `ScheduleAssignmentMsg` | Every 5 min  | Primary assigns features to instances           |
| `SchedulerHeartbeatMsg` | Every 1 min  | Failover detection (absent >10 min = takeover)  |
| `ScheduleConflictMsg`   | On conflict  | Resolve double-claims (higher instanceId loses) |
| `ProjectProgressMsg`    | Per phase    | Track phase completion across instances         |

### DORA Metrics and Friction Observability

`AvaChannelReactorService` also posts operational signals over the Ava Channel:

- **`DoraReport`**: Per-instance DORA metrics broadcast as `[dora_report]` **every hour** using a 1-day sliding window from `DoraMetricsService`. Peers merge incoming reports into a `MetricsDocument` (`domain='metrics', id='dora'`). Metrics include `deploymentsLast24h`, `avgLeadTimeMs`, `blockedCount`, `doneCount`, and `computedAt`.
- **`FrictionReport`**: Recurring failure patterns from `FrictionTrackerService`. When the same failure pattern exceeds a threshold, a System Improvement feature is automatically filed.
- **`PatternResolved`**: Broadcast as `[pattern_resolved]` when a System Improvement feature completes. Peers clear local friction counters for the resolved pattern.

### Metrics API Endpoints

| Endpoint                             | Description                                                     |
| ------------------------------------ | --------------------------------------------------------------- |
| `GET /api/metrics/dora`              | Local DORA metrics merged with the aggregate CRDT snapshot      |
| `GET /api/metrics/dora/history`      | Time-bucketed DORA trend data                                   |
| `GET /api/metrics/stage-durations`   | Per-feature time in each status stage with flow efficiency      |
| `GET /api/metrics/flow`              | Cumulative flow diagram time-series (daily status counts)       |
| `GET /api/metrics/friction`          | Active recurring failure patterns from `FrictionTrackerService` |
| `GET /api/metrics/failure-breakdown` | Aggregated `failureClassification.category` counts              |

`/friction` is instance-local. All other endpoints require a `projectPath` query parameter.

## Actionable Item Bridge

`ActionableItemBridgeService` converts distributed events into entries in the operator's unified inbox. It listens to the event bus and auto-creates actionable items for each signal type:

| Source event                         | Creates item type            | Priority                                                           |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------ |
| `hitl:form-requested`                | `hitl_form`                  | high                                                               |
| `notification:created`               | `notification` or `approval` | low; `feature_waiting_approval` → medium                           |
| `escalation:ui-notification`         | `escalation`                 | maps severity: critical→urgent, high→high, medium→medium, low→low  |
| `pipeline:gate-waiting`              | `gate`                       | high                                                               |
| `authority:awaiting-approval`        | `approval`                   | critical/high risk → urgent; medium risk → high; low risk → medium |
| `feature:status-changed` (unblocked) | (dismisses items)            | auto-dismisses pending items for the feature                       |
| `hitl:form-responded` (authority)    | (resolves approval)          | resolves via `AuthorityService.resolveApproval()`                  |

The bridge holds no state. It wires `AuthorityService` via `setAuthorityService()` to avoid circular dependency at construction.

## Authority Service

`AuthorityService` enforces trust-based policy for agent-proposed actions. Each action proposal is evaluated against the agent's trust level and the action's risk level.

### Storage

Persisted in `.automaker/authority/` (not CRDT-synced — each instance maintains an independent registry for its own agents):

| File                  | Contents                                      |
| --------------------- | --------------------------------------------- |
| `agents.json`         | Registered agents with roles and trust levels |
| `trust-profiles.json` | Per-role risk stats                           |
| `approval-queue.json` | Pending proposals awaiting human approval     |
| `audit-log.json`      | AI auto-approval decision records             |
| `decisions.json`      | Append-only JSONL log of all policy decisions |

### Trust Levels

| Trust level | Default roles                                                                | Max risk allowed |
| ----------- | ---------------------------------------------------------------------------- | ---------------- |
| 0           | (untrusted / unregistered)                                                   | low              |
| 1           | `product-manager`, `project-manager`, `engineering-manager`, `gtm-authority` | low              |
| 2           | `principal-engineer`                                                         | medium           |
| 3           | `cto`                                                                        | high             |

When a proposal's risk ≤ the agent's max allowed risk it is auto-approved (or auto-approved by the risk classifier if `preApproved: true`). Otherwise the proposal enters the approval queue and `authority:awaiting-approval` is emitted.
