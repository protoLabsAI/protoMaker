> **Archived March 2026** — The Ava Channel (AvaChannelService, HTTP routes, CRDT-backed message store, and backchannel infrastructure) was removed. Multi-instance coordination now uses the PeerMeshService WebSocket layer only. See [Peer Mesh Service](../server/peer-mesh-service.md) and [Distributed Sync](../dev/distributed-sync.md).

---

# Ava Channel

Private coordination channel for multi-instance Ava communication, CRDT-backed message storage, and automatic System Improvements ticket filing.

## Overview

The Ava Channel is a daily-sharded, append-only message store that enables Ava instances to coordinate across a multi-instance mesh. Key features:

- **Multi-instance coordination** — Ava instances share observations, decisions, and status via free-form messages
- **CRDT-backed sync** — messages replicate across instances automatically when a CRDTStore is configured
- **System Improvements auto-filing** — Ava can file improvement tickets after cross-instance discussion confirms an issue
- **Archival** — shards older than 30 days are archived to disk as JSON and unloaded from memory

## Architecture

```
POST /api/ava-channel/send
  └── AvaChannelService.postMessage(content, source, opts)
        ├── CRDT mode: writes to doc:ava-channel/YYYY-MM-DD (auto-synced across mesh)
        └── Memory mode: in-process Map<date, messages[]>

GET /api/ava-channel/messages
  └── AvaChannelService.getMessages({ from, to, instanceId })
        ├── Queries live shard(s) covering the date range
        └── Falls back to archived JSON files for older dates

POST /api/ava-channel/file-improvement
  ├── Gate 1: discussantCount >= 2 (422 if not met)
  ├── Gate 2: rate limit 3 tickets/instance/day (429 if exceeded)
  ├── Gate 3: dedup by title against System Improvements backlog (409 if duplicate)
  └── FeatureLoader.create(projectPath, featureData) → System Improvements project
```

## API Reference

### POST /api/ava-channel/send

Post a message to the private Ava coordination channel.

**Request body:**

```typescript
{
  message: string;       // required — the message content
  context?: string;      // optional — appended as "Context: ..." after message
  instanceId?: string;   // optional — identifies the sending instance; 'operator' sets source='operator'
}
```

**Response:**

```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "content": "message text\n\nContext: context text",
    "source": "ava",
    "instanceName": "ava-primary",
    "timestamp": "2026-03-08T12:00:00.000Z"
  }
}
```

**Errors:**

| Status | Type                  | Cause                                                    |
| ------ | --------------------- | -------------------------------------------------------- |
| 400    | `validation_error`    | `message` is missing or not a string                     |
| 503    | `service_unavailable` | AvaChannelService not initialized (single-instance mode) |

---

### GET /api/ava-channel/messages

Read messages from the channel with optional time and instance filtering. Results are deduplicated by message ID.

**Query parameters:**

| Param        | Type            | Description                                      |
| ------------ | --------------- | ------------------------------------------------ |
| `since`      | ISO 8601 string | Only return messages at or after this timestamp  |
| `until`      | ISO 8601 string | Only return messages at or before this timestamp |
| `instanceId` | string          | Filter to messages from a specific instance      |

**Response:**

```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "content": "I noticed latency spikes on feature creation",
      "source": "ava",
      "instanceName": "ava-worker-1",
      "timestamp": "2026-03-08T11:45:00.000Z"
    }
  ],
  "total": 1
}
```

**Errors:**

| Status | Type                  | Cause                             |
| ------ | --------------------- | --------------------------------- |
| 503    | `service_unavailable` | AvaChannelService not initialized |

---

### POST /api/ava-channel/file-improvement

File a System Improvements ticket after cross-instance discussion. Three gates must pass before the ticket is created.

**Request body:**

```typescript
{
  projectPath: string;           // required — path to the project root
  title: string;                 // required — ticket title (used for dedup check)
  description: string;           // required — full problem description
  frictionSummary: string;       // required — one-line summary of the friction
  discussionContext?: string;    // optional — relevant channel messages as evidence
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  priority?: 0 | 1 | 2 | 3 | 4; // default: 3
  instanceId?: string;           // identifies the filing instance (for rate limiting)
  discussantCount?: number;      // number of distinct instances that discussed this; default: 1
}
```

**Response (success):**

```json
{
  "success": true,
  "feature": {
    "id": "feature-xxx",
    "title": "Feature creation latency spikes under load",
    "status": "backlog",
    "projectSlug": "system-improvements"
  },
  "rateLimit": {
    "remaining": 2,
    "resetsAt": "2026-03-08T23:59:59Z"
  }
}
```

**Error responses:**

| Status | Type                           | When                                  | Corrective action                                        |
| ------ | ------------------------------ | ------------------------------------- | -------------------------------------------------------- |
| 400    | `validation_error`             | Required field missing                | Provide all required fields                              |
| 422    | `discussion_threshold_not_met` | `discussantCount < 2`                 | Read channel first; wait for another instance to confirm |
| 429    | `rate_limit_exceeded`          | >3 tickets/instance/day               | Wait until tomorrow (resets at midnight UTC)             |
| 409    | `duplicate_ticket`             | Title matches existing backlog ticket | Reference existing ticket instead                        |

**422 error payload example:**

```json
{
  "success": false,
  "error": {
    "message": "At least 2 Ava instances must have discussed this friction point...",
    "type": "discussion_threshold_not_met",
    "discussantCount": 1,
    "required": 2
  }
}
```

**409 error payload example:**

```json
{
  "success": false,
  "error": {
    "message": "A similar ticket already exists: \"Feature creation latency\" (backlog)",
    "type": "duplicate_ticket",
    "existingFeatureId": "feature-abc",
    "existingFeatureTitle": "Feature creation latency",
    "existingFeatureStatus": "backlog"
  }
}
```

## Message Storage

### Daily Sharding

Messages are stored in CRDT documents keyed by date:

```
doc:ava-channel/2026-03-08
doc:ava-channel/2026-03-07
...
```

Each shard holds all messages for one UTC day. Shards are append-only — no message is ever modified after posting.

### CRDT vs. Memory Mode

| Mode   | When                 | Behavior                                                         |
| ------ | -------------------- | ---------------------------------------------------------------- |
| CRDT   | `CRDTStore` provided | Messages auto-replicate across all mesh peers via WebSocket sync |
| Memory | No store             | In-process `Map<date, messages[]>`; messages lost on restart     |

In memory mode, `POST /api/ava-channel/send` and `GET /api/ava-channel/messages` still work — they are scoped to the local instance only.

### Archival

The archival cycle runs hourly. Shards older than 30 days are:

1. Written to `{archiveDir}/YYYY-MM-DD.json`
2. Removed from the CRDT store / memory

Archived shards are read transparently by `getMessages()` when a query's date range includes archived dates.

## EventBus Auto-Posts

`ava-channel.module.ts` wires EventBus events to automatic channel posts. Posts are suppressed when no peers are connected (single-instance mode).

| EventBus event             | Channel message                                      |
| -------------------------- | ---------------------------------------------------- |
| `feature:status-changed`   | Status change summary (batched, 5s debounce)         |
| `feature:error`            | Agent failure notification with feature ID and error |
| `auto-mode:started`        | "Auto-mode started" with trigger info                |
| `auto-mode:stopped`        | "Auto-mode stopped" with reason                      |
| `milestone:completed`      | Milestone completion announcement                    |
| `project:completed`        | Project completion announcement                      |
| `sync:peer-unreachable`    | Peer connectivity loss notice                        |
| `sync:partition-recovered` | Partition recovery notice                            |

## Reactive Reactor

The reactor makes Ava instances responsive to each other's messages. When one instance posts a help request or coordination message, peer instances evaluate and respond autonomously.

> **Full reference:** See [Ava Channel Reactor](./ava-channel-reactor) for complete documentation including fleet coordination, work intake, health alerts, DORA reporting, and escalation protocol.

### Architecture

```
CRDT shard change (new message arrives)
  --> AvaChannelReactorService.onShardChange()
    --> Filter: is this message already known? (skip if yes)
    --> Layer 1: Classifier chain (pure functions, priority-ordered)
    --> Layer 2: Per-thread cooldown (30s default, prevents rapid replies)
    --> Layer 3: Busy gate (one response at a time, pending queue)
    --> Response dispatch via AvaChannelService.postMessage()
       --> All responses have expectsResponse: false (one-shot policy)
```

### Classifier Chain

The classifier chain determines whether a message warrants a response. Rules are pure functions evaluated highest-to-lowest priority. The first non-null result wins.

**Protocol message pre-filter:** Before the classifier chain runs, `handleWorkStealProtocol()` intercepts any `source: 'system'` message whose content starts with a `[bracket_prefix]` (e.g. `[capacity_heartbeat]`, `[work_request]`, `[schedule_assignment]`). These machine-to-machine messages are dispatched to typed handlers and never enter the classifier chain.

| Priority | Rule                | Blocks When                                                              |
| -------- | ------------------- | ------------------------------------------------------------------------ |
| 100      | LoopBreakerRule     | `conversationDepth >= maxConversationDepth`                              |
| 90       | TerminalMessageRule | `expectsResponse === false`                                              |
| 80       | SelfMessageRule     | `instanceId === localInstanceId`                                         |
| 75       | StaleMessageRule    | Message older than `staleThresholdMs`                                    |
| 70       | SystemSourceRule    | `source: 'system'` (residual — protocol messages already filtered above) |
| 50       | RequestRule         | `intent: 'request'` + `expectsResponse: true` --> respond                |
| 40       | CoordinationRule    | `intent: 'coordination'` --> respond if capacity available               |
| 30       | EscalationRule      | `intent: 'escalation'` --> respond if depth < 3                          |
| 0        | DefaultRule         | Everything else --> informational, no response                           |

**Usage:**

```typescript
import { createClassifierChain, runClassifierChain } from './ava-channel-classifiers.js';

const { rules, context } = createClassifierChain('my-instance-id', {
  maxConversationDepth: 5,
  staleThresholdMs: 300_000,
  runningAgents: 2,
  maxAgents: 5,
});

const classification = runClassifierChain(message, context, rules);
// { type: 'request', shouldRespond: true, intent: 'request', reason: '...' }
```

### Response Handlers

Four built-in handlers process classified messages:

| Handler             | Handles        | Behavior                                 |
| ------------------- | -------------- | ---------------------------------------- |
| HelpRequestHandler  | `request`      | Posts capacity status, offers to assist  |
| CoordinationHandler | `coordination` | Posts capacity metrics (agents, backlog) |
| SystemAlertHandler  | `escalation`   | Acknowledges system-source alerts        |
| EscalationHandler   | `escalation`   | Acknowledges non-system escalations      |

All handlers follow the **one-shot response policy**: every response has `intent: 'response'` and `expectsResponse: false`. This ensures the TerminalMessageRule blocks any further responses, preventing infinite loops at the type level.

### Loop Prevention (Three Layers)

1. **Classifier chain** -- Self-messages, terminal messages, stale messages, and depth-exceeded messages are blocked before any handler runs
2. **Per-thread cooldown** -- After responding to a thread, the reactor ignores that thread for 30 seconds (configurable via `cooldownMs`)
3. **Busy gate** -- Only one response dispatches at a time; additional messages queue and are re-evaluated when the gate opens

### Message Protocol Fields

Messages carry structured metadata for the classifier chain:

```typescript
interface AvaChatMessage {
  // ... existing fields
  intent?: MessageIntent; // 'request' | 'inform' | 'response' | 'coordination' | 'escalation' | 'system_alert'
  expectsResponse?: boolean; // true = wants a reply, false = terminal
  conversationDepth?: number; // 0 = root, incremented on each reply
  inReplyTo?: string; // ID of the message being replied to
}
```

### Friction Tracking

The `AvaChannelFrictionTracker` monitors recurring failure patterns in the reactor. When a pattern occurs 3+ times, it auto-files a System Improvement feature on the board.

```typescript
tracker.recordFriction('handler-failed:help-request', 'Help request handler failed', messageId);
// After 3 occurrences: auto-creates "[System Improvement] Fix recurring friction: ..."
```

Metrics available via `tracker.getMetrics()`:

- `patternsDetected` -- number of distinct friction patterns
- `featuresAutoFiled` -- number of features created
- `totalFrictionEvents` -- total friction occurrences

### Reactor Settings

Configured in `.automaker/settings.json` under `workflowSettings.avaChannelReactor`:

| Setting                   | Default  | Description                                   |
| ------------------------- | -------- | --------------------------------------------- |
| `enabled`                 | `true`   | Enable/disable the reactor                    |
| `maxConversationDepth`    | `1`      | Max reply depth before loop breaker activates |
| `cooldownMs`              | `30000`  | Per-thread cooldown after responding (ms)     |
| `staleMessageThresholdMs` | `300000` | Ignore messages older than this (ms)          |
| `enableFrictionTracking`  | `true`   | Track recurring friction patterns             |

### Self-Healing

- **Subscription failure**: Retries with exponential backoff (5s base, 60s cap)
- **Midnight shard rotation**: Automatically rotates to the new UTC day's shard
- **Known message hydration**: On startup, loads existing messages to prevent retroactive responses

## Key Files

| File                                                                   | Role                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/server/src/routes/ava-channel/index.ts`                          | HTTP routes -- send, messages, file-improvement                             |
| `apps/server/src/services/ava-channel-service.ts`                      | Storage engine -- CRDT shards, archival, message retrieval                  |
| `apps/server/src/services/ava-channel.module.ts`                       | EventBus wiring -- auto-posts on system events                              |
| `apps/server/src/services/ava-channel-classifiers.ts`                  | Classifier chain -- 9 pure-function rules for message routing               |
| `apps/server/src/services/ava-channel-reactor-service.ts`              | Reactor service -- CRDT subscription, three-layer loop prevention, dispatch |
| `apps/server/src/services/ava-channel-handlers.ts`                     | Response handlers -- HelpRequest, Coordination, SystemAlert, Escalation     |
| `apps/server/src/services/ava-channel-friction-tracker.ts`             | Friction tracking -- pattern detection and auto-filed features              |
| `libs/types/src/ava-channel.ts`                                        | Types -- `AvaChatMessage`, `MessageIntent`, `AvaChannelReactorSettings`     |
| `apps/server/tests/unit/services/ava-channel-classifiers.test.ts`      | Unit tests -- classifier chain rules (32 tests)                             |
| `apps/server/tests/unit/services/ava-channel-handlers.test.ts`         | Unit tests -- response handlers (15 tests)                                  |
| `apps/server/tests/unit/services/ava-channel-friction-tracker.test.ts` | Unit tests -- friction tracker (17 tests)                                   |

## Coordination Pattern

The expected usage pattern for Ava instances filing improvement tickets:

```
1. Ava-A observes friction (e.g., latency spike on feature creation)
2. Ava-A posts to channel: "Noticed feature creation taking 5s+ under load"
3. Ava-B reads channel, confirms: "Same here, reproducible with concurrent saves"
4. Either instance calls POST /api/ava-channel/file-improvement with discussantCount: 2
5. Ticket created in System Improvements backlog, assigned to 'agent'
```

## See Also

- [Ava Channel Reactor](./ava-channel-reactor) — Full reactor reference: fleet coordination, work intake, health alerts, DORA reporting
- [Distributed Sync](../dev/distributed-sync.md) — CRDT mesh, leader election, and partition recovery
- [Route Organization](./route-organization.md) — Express route registration patterns
