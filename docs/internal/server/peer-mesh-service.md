# Peer Mesh Service

WebSocket-based multi-instance coordination layer that keeps feature events, project changes, settings, and peer capacity in sync across the Hivemind mesh.

> **Renamed:** `CrdtSyncService` was renamed to `PeerMeshService` in March 2026 and made conditional on `hivemind.enabled`. The CRDT binary sync layer (Automerge / CRDTStore on `:4445`) was removed at the same time — the mesh now handles only event broadcasting, heartbeats, and leader election.

## Overview

`PeerMeshService` manages the low-level peer-to-peer sync transport between protoLabs instances. It reads `proto.config.yaml` at startup to determine whether this instance is the **primary** (runs a WebSocket server) or a **worker** (connects as a client).

**When `hivemind.enabled` is `false` in `proto.config.yaml`, this service is a no-op** — no WebSocket server is started, no timers fire, and no peer connections are attempted.

Key responsibilities:

- **Heartbeat protocol** — publishes live capacity metrics to all peers every 30s
- **Feature event sync** — broadcasts `feature:created`, `feature:updated`, `feature:deleted`, and `feature:status-changed` to all peers
- **Project event sync** — broadcasts project CRUD events so all instances stay consistent
- **Settings broadcast** — primary pushes shared settings to workers (no credentials included)
- **Network partition handling** — queues outbound events while disconnected; replays on reconnect

## Architecture

```text
proto.config.yaml
  --> role: primary → start WebSocket server (default port 4444)
  --> role: worker  → connect as WebSocket client to primary URL

PeerMeshService
  ├── Heartbeat loop (30s)    → broadcasts PeerMessage{type: 'heartbeat', capacity}
  ├── TTL check loop (10s)    → evicts peers absent > 120s
  ├── EventBus bridge         → CRDT_SYNCED_EVENT_TYPES trigger CrdtSyncWireMessage broadcasts
  └── Reconnect loop (5s)     → workers auto-reconnect on disconnect
```

## Instance Roles

| Role      | Behavior                                                     |
| --------- | ------------------------------------------------------------ |
| `primary` | Runs `WebSocketServer`; relays messages between all workers  |
| `worker`  | Connects to primary URL; receives relay of all peer messages |

Role is determined by the `instance.syncRole` (or `role`) field in `proto.config.yaml`. If the file is absent, or if `hivemind.enabled` is `false`, the instance starts as a standalone (no sync).

## Wire Message Types

### PeerMessage (Heartbeat / Identity)

Sent by every instance on connect and every 30 seconds:

```typescript
interface PeerMessage {
  type: 'heartbeat' | 'goodbye' | 'identity' | 'promote';
  instanceId: string;
  name?: string; // from proto.config.yaml instance.name
  role?: InstanceRole; // from proto.config.yaml instance.role
  tags?: string[]; // from proto.config.yaml instance.tags
  url?: string;
  timestamp: string;
  priority?: number;
  capacity?: InstanceCapacity;
}
```

`capacity` is populated on every heartbeat by the registered `_capacityProvider` callback.

### CrdtSyncWireMessage

Synced event types: `feature:created`, `feature:updated`, `feature:deleted`, `feature:status-changed`, plus project equivalents.

```typescript
interface CrdtSyncWireMessage {
  type: 'feature_event';
  instanceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: string;
  projectName?: string; // project-scoping — reject if mismatch
}
```

**Project scoping:** The `projectName` field prevents cross-project event contamination. Workers reject events whose `projectName` doesn't match their own.

### CrdtSettingsEvent

Primary → workers only. No credentials or API keys may be included.

```typescript
interface CrdtSettingsEvent {
  type: 'settings_event';
  instanceId: string;
  settings: Record<string, unknown>;
  timestamp: string;
}
```

## Heartbeat and TTL

| Constant                | Default   | Description                           |
| ----------------------- | --------- | ------------------------------------- |
| `DEFAULT_HEARTBEAT_MS`  | `30_000`  | Interval between heartbeat broadcasts |
| `DEFAULT_TTL_MS`        | `120_000` | Peer eviction timeout (no heartbeat)  |
| `RECONNECT_INTERVAL_MS` | `5_000`   | Worker reconnect retry interval       |
| `TTL_CHECK_INTERVAL_MS` | `10_000`  | Frequency of TTL enforcement checks   |
| `DEFAULT_SYNC_PORT`     | `4444`    | WebSocket server port on primary      |

## Leader Election

When the primary is unreachable (worker loses connection and cannot reconnect), a promotion flow is initiated:

```text
Worker detects primary unreachable
  --> Sends `promote` PeerMessage to remaining peers
  --> Peer with highest priority wins election
  --> Winner starts a local WebSocket server
  --> Other workers reconnect to the new primary
```

`selfPriority` is read from `proto.config.yaml`. Tie-breaks use lexicographic `instanceId`.

## Network Partition Handling

When a worker is disconnected from the mesh:

- `partitionSince` is set to the ISO timestamp of disconnect
- Outbound events are queued in `outboundQueue` (in-memory)
- On reconnect, queued messages are replayed to the primary
- `partitionSince` is cleared after successful reconnect

## EventBus Bridge

`attachEventBus(bus)` wires the sync service into the local event system:

1. **Outbound** — `bus.setRemoteBroadcaster()` intercepts calls to `broadcast()` for synced types, serializes as `CrdtSyncWireMessage`, and sends to peers
2. **Inbound** — incoming `feature_event` messages call `bus.emit()` (NOT `broadcast()`) to prevent feedback loops

## Callbacks (must be set before `start()`)

| Method                                 | When called                                         |
| -------------------------------------- | --------------------------------------------------- |
| `onSettingsReceived(cb)`               | A remote peer sent a `settings_event`               |
| `onRemoteFeatureEvent(cb)`             | A remote peer sent a `feature_event`                |
| `setCapacityProvider(fn)`              | Each heartbeat — returns current `InstanceCapacity` |
| `setCompactionDiagnosticsProvider(fn)` | Each `getSyncStatus()` call                         |

## `getSyncStatus()` Response

```typescript
interface SyncServerStatus {
  role: SyncRole; // 'primary' | 'worker'
  connected: boolean; // worker: connected to primary; primary: server running
  peerCount: number;
  peers: HivemindPeer[];
  syncPort: number;
  partitionSince: string | null;
  queuedMessageCount: number;
  compactionDiagnostics?: CompactionDiagnosticsSnapshot;
}
```

## Key Files

| File                                            | Role                                                  |
| ----------------------------------------------- | ----------------------------------------------------- |
| `apps/server/src/services/peer-mesh-service.ts` | Core sync service — WebSocket server/client lifecycle |
| `apps/server/src/services/crdt-sync.module.ts`  | Module wiring — injects dependencies at startup       |
| `libs/types/src/events.ts`                      | `CrdtSyncWireMessage` wire type with `projectName`    |

## See Also

- [Distributed Sync](../dev/distributed-sync.md) — Peer mesh architecture and leader election protocol
- [Work Intake Service](./work-intake-service) — phase claiming coordination
- [Hivemind API](./hivemind-api) — peer status HTTP endpoints
