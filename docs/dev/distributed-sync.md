# Distributed Sync

How protoLabs synchronizes state across multiple instances using the peer mesh, leader election, partition detection, and pull-based work intake.

> **Updated March 2026:** The Automerge/CRDT layer (CRDTStore, Automerge binary sync, AvaChannelService, CalendarService CRDT injection, TodoService CRDT injection) was removed. The sync mesh now consists of a single WebSocket layer (`PeerMeshService`) for event broadcasting, heartbeats, and leader election. Document state is disk-based on each instance; coordination uses the pull-based `WorkIntakeService`.

## Architecture Overview

protoLabs uses a single-layer WebSocket sync mesh when hivemind mode is enabled:

| Layer         | Service           | Port              | Purpose                                          |
| ------------- | ----------------- | ----------------- | ------------------------------------------------ |
| **Sync mesh** | `PeerMeshService` | `:4444` (default) | Peer heartbeat, leader election, event broadcast |

One instance acts as **primary** and others connect as **workers**. Instances exchange feature and project events in real time. Features are always instance-local — they never cross the wire.

```
Worker A ──────┐
               ▼
Worker B ────▶ Primary (:4444 PeerMeshService)
               ▲
Worker C ──────┘
```

Work distribution uses a **pull-based intake model**: instances claim phases from shared project documents (via `WorkIntakeService`) rather than pushing features to each other.

### Layered Services

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WorkIntakeService                                  │  ← Phase claiming (pull-based)
├─────────────────────────────────────────────────────────────────────┤
│               PeerMeshService (:4444)                                │  ← Peer mesh + leader election
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
    "queuedChanges": 0
  }
}
```

| Field            | Description                                         |
| ---------------- | --------------------------------------------------- |
| `role`           | `primary` or `worker`                               |
| `connected`      | Whether this instance is connected to the sync mesh |
| `partitionSince` | ISO timestamp when connectivity was lost, or `null` |
| `queuedChanges`  | Number of changes buffered while disconnected       |

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

## Work Intake Protocol

Work distribution uses a **pull-based intake model** via `WorkIntakeService`. Each instance independently claims phases from shared project documents — no centralized coordinator pushes work.

**How it works:**

1. `WorkIntakeService` runs on a configurable tick (default 30s) when auto-mode is active.
2. Each tick, the service reads shared project docs and finds claimable phases using pure functions from `@protolabsai/utils`.
3. Phases are claimable when: unclaimed, dependencies satisfied, and role/tag affinity matches.
4. The instance writes `claimedBy=myInstanceId` to the shared project doc.
5. After a 200ms settle delay, it verifies the claim survived merge (LWW resolution).
6. If the claim is held, the phase is materialized as a **local feature** on the instance's board.
7. On completion, the shared phase is updated: `executionStatus='done'`, `prUrl=...`.

**Features never cross the wire.** Phases are the coordination unit. Each instance creates local features from claimed phases and executes them independently.

**Pure functions** (in `libs/utils/src/work-intake.ts`):

| Function                                                    | Purpose                                               |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `getClaimablePhases(project, instanceId, role, tags)`       | Filter phases this instance can claim                 |
| `roleMatchesPhase(role, tags, phase)`                       | Check role/tag affinity against `phase.filesToModify` |
| `holdsClaim(phase, instanceId)`                             | Verify claim survived merge                           |
| `materializeFeature(project, milestone, phase, instanceId)` | Convert phase to local Feature data                   |
| `phaseDepsAreSatisfied(phase, milestone, project)`          | Check all phase deps are `done`                       |
| `isReclaimable(phase, peerStatus, claimTimeoutMs)`          | Check if stale claim can be reclaimed                 |
| `phasePriority(project, milestone, phase)`                  | Scoring for claim sort order                          |

**Stale claim recovery:** If an instance crashes mid-work, the phase stays claimed. Other instances check the claiming instance's heartbeat status. If offline for longer than `claimTimeoutMs` (default 30min), the phase becomes reclaimable — `claimedBy` is cleared and `executionStatus` reset to `unclaimed`.

**Instance roles** influence work routing but don't hard-block assignments:

| Role        | Primary Focus            |
| ----------- | ------------------------ |
| `fullstack` | Takes any work (default) |
| `frontend`  | Prefers UI/client paths  |
| `backend`   | Prefers server/API paths |
| `infra`     | CI/CD, deployment, ops   |
| `docs`      | Documentation, content   |
| `qa`        | Testing, validation      |

Roles are configured in `proto.config.yaml` under `instance.role`. A `frontend` instance picks up backend work if no backend-focused instance is available.

### Escalation Protocol (Blocked Feature Handoff)

When an instance is blocked on a feature (e.g., waiting for a human decision) and cannot make progress:

1. The blocked instance posts an `EscalationRequest` via the escalation router.
2. Any instance with capacity responds with an `EscalationOffer`.
3. The blocked instance replies with `EscalationAccept`, transferring ownership.
4. The accepting instance takes over the feature from its current state.

This prevents features from stalling when an individual instance is stuck.

## Sync Events

### EventBus events (internal)

| Event                      | Payload                               | Description                                                      |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `sync:partition-recovered` | `{ instanceId, partitionDurationMs }` | Emitted after a network partition heals and changes are replayed |
| `sync:peer-unreachable`    | `{ instanceId, lastSeen, peerTtlMs }` | Emitted when a peer exceeds its TTL                              |

These events are emitted on the internal `EventEmitter` passed to `peerMeshService.attachEventBus()`.

### Wire message types

Feature and project events are serialized as `CrdtSyncWireMessage` with a `type: 'feature_event'` discriminant:

```typescript
interface CrdtSyncWireMessage {
  type: 'feature_event';
  instanceId: string;
  eventType: string; // e.g. 'feature:created', 'project:updated'
  payload: Record<string, unknown>;
  timestamp: string;
  projectName?: string; // scoping — reject if mismatch
}
```

## See Also

- [Peer Mesh Service](../server/peer-mesh-service.md) — low-level WebSocket transport, heartbeat constants, callbacks
- [Work Intake Service](../server/work-intake-service.md) — phase claiming protocol details
- [Route Organization](../server/route-organization.md) — Express route registration patterns
