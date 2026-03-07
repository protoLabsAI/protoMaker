# Distributed Sync

How protoLabs synchronizes state across multiple instances using Automerge CRDTs, partition detection, and reconnection resilience.

## Architecture Overview

protoLabs uses a WebSocket-based sync mesh where one instance acts as **primary** and others connect as **workers**. All instances exchange CRDT changes (feature events, project events, settings) in real time.

```
Worker A ──────┐
               ▼
Worker B ────▶ Primary (WebSocket server :4444)
               ▲
Worker C ──────┘
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
const doc = handle.docSync();

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

| Event                      | Payload                               | Description                                                      |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `sync:partition-recovered` | `{ instanceId, partitionDurationMs }` | Emitted after a network partition heals and changes are replayed |
| `sync:peer-unreachable`    | `{ instanceId, lastSeen, peerTtlMs }` | Emitted when a peer exceeds its TTL                              |

These events are emitted on the internal `EventEmitter` passed to `crdtSyncService.attachEventBus()`.
