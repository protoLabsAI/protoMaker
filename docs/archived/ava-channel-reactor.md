> **Archived March 2026** — AvaChannelReactorService was removed along with the Ava Channel infrastructure. Fleet coordination via the CRDT-backed Ava Channel is no longer active. WorkIntakeService handles phase-claiming coordination independently. See [Work Intake Service](../server/work-intake-service.md) and [Distributed Sync](../dev/distributed-sync.md).

---

# Ava Channel Reactor

Reactive orchestrator that makes Ava instances responsive to each other and coordinates fleet-level work distribution across the multi-instance mesh.

## Overview

The `AvaChannelReactorService` subscribes to the CRDT-backed Ava Channel and autonomously responds to messages from peer instances. Beyond basic message response, it handles:

- **Message classification** — rule-based chain determines whether a message warrants a response
- **Loop prevention** — three independent layers prevent infinite message cycles
- **Fleet coordination** — capacity heartbeats, work intake, and escalation protocol
- **Health monitoring** — pauses work acquisition from degraded peers
- **DORA reporting** — hourly broadcast of local DORA metrics to the mesh
- **Friction tracking** — receives and de-duplicates recurring failure pattern reports

## Architecture

```
CRDT shard change (new message arrives)
  --> AvaChannelReactorService.onShardChange()
    --> Filter: is this message already known? (skip if yes)
    --> Layer 1: Classifier chain (pure functions, priority-ordered)
    --> Layer 2: Per-thread cooldown (30s default, prevents rapid replies)
    --> Layer 3: Busy gate (one response at a time, pending queue)
    --> Specialized handler dispatch:
          phase claims                --> WorkIntakeService (pull-based)
          capacity_heartbeat          --> PeerCapacityTracker
          escalation_*                --> EscalationCoordinator
          health_alert                --> HealthAlertHandler
          friction_report             --> FrictionTrackerService
          pattern_resolved            --> FrictionTrackerService
          dora_report                 --> DoraMetricsAggregator
          [classified message]        --> Response handlers
    --> Response via AvaChannelService.postMessage()
         --> expectsResponse: false on all responses (one-shot policy)
```

## Classifier Chain

Pure functions evaluated highest-to-lowest priority. The first non-null result wins.

| Priority | Rule                | Blocks When                                               |
| -------- | ------------------- | --------------------------------------------------------- |
| 100      | LoopBreakerRule     | `conversationDepth >= maxConversationDepth`               |
| 90       | TerminalMessageRule | `expectsResponse === false`                               |
| 80       | SelfMessageRule     | `instanceId === localInstanceId`                          |
| 75       | StaleMessageRule    | Message older than `staleThresholdMs`                     |
| 70       | SystemSourceRule    | `source: 'system'` (unless `[BugReport]`/`[SystemAlert]`) |
| 50       | RequestRule         | `intent: 'request'` + `expectsResponse: true` → respond   |
| 40       | CoordinationRule    | `intent: 'coordination'` → respond if capacity available  |
| 30       | EscalationRule      | `intent: 'escalation'` → respond if depth < 3             |
| 0        | DefaultRule         | Everything else → informational, no response              |

## Loop Prevention (Three Layers)

1. **Classifier chain** — Self-messages, terminal messages, stale messages, and depth-exceeded messages blocked before any handler runs
2. **Per-thread cooldown** — After responding to a thread, the reactor ignores that thread for 30 seconds (configurable via `cooldownMs`)
3. **Busy gate** — Only one response dispatches at a time; additional messages queue and are re-evaluated when the gate opens

All responses set `expectsResponse: false` enforcing the **one-shot response policy** at the type level.

## Fleet Coordination

### Capacity Heartbeats

Every 60 seconds (default), the reactor broadcasts a `capacity_heartbeat` message:

```typescript
interface CapacityHeartbeat {
  instanceId: string;
  role: string;
  backlogCount: number; // features in backlog
  activeCount: number; // features currently in-progress
  maxConcurrency: number; // max concurrent agents
  cpuLoad: number; // 0–100
  memoryUsed: number; // 0–100
}
```

Peer instances receive these and update their local `peerCapacities` map. The capacity map drives health alert decisions.

**Note:** `[capacity_heartbeat]` messages have `source: 'system'` and are intercepted before the classifier chain runs — they never trigger a classifier response.

### Work Intake

Work distribution uses a **pull-based intake model** via `WorkIntakeService`. Each instance independently claims phases from shared project documents. Features never cross the wire — instances create local features from claimed phases.

The `WorkIntakeService` runs on a configurable tick (default 30s) when auto-mode is active. See [distributed-sync.md](../dev/distributed-sync.md#work-intake-protocol) for the full protocol, pure functions, and instance role descriptions.

### Escalation Protocol

Three-message handshake for handing off a blocked feature to a peer:

```
escalation_request (from stuck instance)
  --> Peer: able to take it? → send escalation_offer
  --> Requester: accept offer → send escalation_accept
  --> FleetSchedulerService.reassign(featureId, acceptingInstanceId)
```

The `EscalationCoordinator` tracks pending escalations and enforces timeouts (30s default). If no offer arrives within the timeout, the stuck instance retries escalation to a different peer.

### Health Alerts

Each instance broadcasts a `[health_alert]` when its own resource usage exceeds fixed thresholds (checked during the capacity heartbeat cycle):

```typescript
interface HealthAlert {
  instanceId: string;
  memoryUsed: number; // percentage 0–100
  cpuLoad: number; // percentage 0–100
  alertTimestamp: string; // ISO 8601
}
```

**Thresholds:**

| Resource | Threshold |
| -------- | --------- |
| Memory   | > 85%     |
| CPU      | > 90%     |

While a peer is marked degraded (has sent a recent `health_alert`), work intake from that peer is paused for 5 minutes. There is a single threshold level (no warning/critical distinction).

### DORA Reports

Every hour, if a `DoraMetricsService` is wired in, the reactor broadcasts:

```typescript
{
  type: 'dora_report';
  instanceId: string;
  deploymentFrequency: number; // deployments per day
  leadTimeHours: number;
  changeFailureRate: number; // 0–1
  windowDays: number; // reporting window
  timestamp: string; // ISO-8601
}
```

Peers store incoming DORA reports in `CRDTStore` under `domain='metrics', id='dora'` for aggregate queries.

## Friction Tracking Integration

The reactor connects to `FrictionTrackerService` (optional):

- On `friction_report` messages — calls `handlePeerReport(report)` for cross-instance de-duplication
- On `pattern_resolved` messages — calls `resolvePattern(pattern)` to reset counters
- On handler failures — calls `recordFailure(pattern)` after 3 occurrences auto-files a System Improvement

See `FrictionTrackerService` for threshold and filing logic.

## ReactorStatus

The `getStatus()` method returns current operational metrics:

```typescript
interface ReactorStatus {
  active: boolean; // subscription is live
  enabled: boolean; // from settings
  peersCount: number; // peers with recent heartbeat
  responsesSent: number; // responses dispatched (lifetime)
  errorCount: number; // dispatch failures (lifetime)
  cooldownThreads: number; // threads currently in cooldown
  degradedPeerCount: number; // peers above health thresholds
  pendingEscalationCount: number; // escalations awaiting offer
}
```

## Self-Healing

- **Subscription failure** — retries with exponential backoff (5s base, 60s cap)
- **Midnight shard rotation** — automatically rotates to the new UTC day's shard
- **Known message hydration** — on startup, loads existing messages to prevent retroactive responses
- **Heartbeat timeout** — peers absent for > `peerTtlMs` (default 120s) are evicted from capacity map

## Configuration

Configured in `.automaker/settings.json` under `workflowSettings.avaChannelReactor`:

| Setting                   | Default   | Description                                               |
| ------------------------- | --------- | --------------------------------------------------------- |
| `enabled`                 | `true`    | Enable/disable the reactor                                |
| `maxConversationDepth`    | `1`       | Max reply depth before loop breaker activates             |
| `cooldownMs`              | `30000`   | Per-thread cooldown after responding (ms)                 |
| `staleMessageThresholdMs` | `300000`  | Ignore messages older than this (ms)                      |
| `enableFrictionTracking`  | `true`    | Track recurring friction patterns                         |
| `heartbeatIntervalMs`     | `60000`   | Interval between capacity heartbeat broadcasts (ms)       |
| `doraReportIntervalMs`    | `3600000` | Interval between DORA metric broadcasts (ms)              |
| `peerTtlMs`               | `120000`  | Time before absent peer is evicted from capacity map (ms) |

## Key Files

| File                                                       | Role                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/server/src/services/ava-channel-reactor-service.ts`  | Core reactor — subscription, classification, fleet coordination |
| `apps/server/src/services/ava-channel-reactor.module.ts`   | Wiring — injects dependencies and starts the reactor on boot    |
| `apps/server/src/services/ava-channel-classifiers.ts`      | Classifier chain — 9 pure-function rules for message routing    |
| `apps/server/src/services/ava-channel-handlers.ts`         | Response handlers — HelpRequest, Coordination, SystemAlert      |
| `apps/server/src/services/ava-channel-friction-tracker.ts` | Channel-level friction tracker (distinct from service-level)    |
| `apps/server/src/services/ava-channel-service.ts`          | Storage engine — provides message I/O to the reactor            |
| `apps/server/src/services/fleet-scheduler-service.ts`      | Fleet scheduler — work assignment and reassignment              |
| `apps/server/src/services/friction-tracker-service.ts`     | Service-level friction tracker — files System Improvements      |
| `apps/server/src/services/dora-metrics-service.ts`         | DORA computation — supplies metrics for hourly DORA reports     |

## See Also

- [Ava Channel](./ava-channel) — transport layer, message protocol, HTTP API
- [DORA Metrics](./dora-metrics) — metrics computation and aggregation
- [Distributed Sync](../dev/distributed-sync.md) — CRDT mesh and leader election
