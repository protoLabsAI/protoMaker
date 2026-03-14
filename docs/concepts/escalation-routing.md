# Escalation routing

The escalation routing system detects and routes critical signals to the appropriate human or system channel. When agents fail, CI breaks, or features get stuck, the `EscalationRouter` ensures the right people are notified through the right medium without spam.

## Architecture

```
Signal Sources                 Router                        Channels
--------------                 ------                        --------
Lead Engineer escalation  -->                            --> DiscordDM
Agent failure             -->                            --> DiscordChannel
CI failure                -->  EscalationRouter          --> GitHubIssue
Health check failure      -->    (dedup + rate limit)    --> UINotification
SLA breach                -->
Board anomaly             -->
```

The router sits between signal producers and delivery channels. Every signal passes through deduplication and rate limiting before reaching any channel.

## Signal flow

1. **Signal emitted** -- A service emits `escalation:signal-received` with an `EscalationSignal` payload
2. **Deduplication check** -- Router checks the `deduplicationKey` against a 30-minute sliding window. Duplicates are logged but not routed
3. **Severity filter** -- `low` severity signals are logged only (no channel routing)
4. **Channel matching** -- Each registered channel's `canHandle(signal)` method is called. Channels that return `true` are candidates
5. **Rate limit check** -- Each candidate channel's rate limit is checked. Channels over their limit are skipped
6. **Delivery** -- Signal is sent to all passing channels. Failures on individual channels don't block others
7. **Audit log** -- Every signal (routed, deduplicated, or rate-limited) is recorded in the in-memory audit log

## EscalationSignal

Defined in `libs/types/src/escalation.ts`:

```typescript
interface EscalationSignal {
  source: EscalationSource; // Where the signal originated
  severity: EscalationSeverity; // Urgency level
  type: string; // Signal type identifier
  context: Record<string, unknown>; // Additional data
  deduplicationKey: string; // Key for dedup window
  timestamp?: string; // ISO 8601
}
```

## Severity levels

| Level       | Behavior                                | Typical use                       |
| ----------- | --------------------------------------- | --------------------------------- |
| `emergency` | Routes to all channels, DM notification | SLA breach, data loss risk        |
| `critical`  | Routes to all matching channels         | Feature fails 3+ times            |
| `high`      | Routes to matching channels             | CI failure, agent stuck           |
| `medium`    | Routes to matching channels             | PR feedback needed, health check  |
| `low`       | Logged only, no channel routing         | Informational, board anomaly note |

**Type:** `EscalationSeverity` enum in `libs/types/src/escalation.ts`

## Signal sources

| Source                        | Description                              |
| ----------------------------- | ---------------------------------------- |
| `pr_feedback`                 | PR feedback requiring attention          |
| `agent_failure`               | Agent execution failure                  |
| `ci_failure`                  | CI/CD pipeline failure                   |
| `health_check`                | Health check failure or degradation      |
| `lead_engineer_escalation`    | Lead Engineer escalation                 |
| `sla_breach`                  | SLA breach detected                      |
| `board_anomaly`               | Board state anomaly detected             |
| `human_mention`               | Human explicitly mentioned in a comment  |
| `agent_needs_input`           | Agent needs human input (elicitation)    |
| `lead_engineer`               | Lead Engineer action executor escalation |
| `lead_engineer_state_machine` | Lead Engineer state machine escalation   |
| `auto_mode_health_sweep`      | Auto-mode health sweep detected issue    |

**Type:** `EscalationSource` enum in `libs/types/src/escalation.ts`

## Channels

Five channels are registered at server startup. Each implements the `EscalationChannel` interface.

### DiscordDM

**File:** `apps/server/src/services/escalation-channels/discord-dm-channel.ts`

Sends direct messages to configured recipients via the Discord bot. Recipients are read from settings. Best for emergency and critical signals that need immediate human attention.

**Registration:** `discord.module.ts` (requires Discord bot initialization first)

### DiscordChannel

**File:** `apps/server/src/services/escalation-channels/discord-channel-escalation.ts`

Posts escalation messages to a configured Discord channel. Used for team-visible alerts that don't require direct notification.

### GitHubIssue

**File:** `apps/server/src/services/escalation-channels/github-issue-channel.ts`

Creates GitHub issues for escalations tied to specific repositories. Uses the feature's associated repository context.

### UINotification

**File:** `apps/server/src/services/escalation-channels/ui-notification-channel.ts`

Emits `escalation:ui-notification` WebSocket events for real-time dashboard updates. Handles all severity levels. Rate-limited at 100 signals per minute.

## Deduplication

Signals are deduplicated by `deduplicationKey` within a configurable window (default: 30 minutes). The dedup state is:

- **Persisted to disk** at `{DATA_DIR}/escalations.json` so dedup windows survive server restarts
- **Loaded on startup** with expired entries filtered out
- **Atomically written** via temp file + rename pattern

When a duplicate is detected, the router emits `escalation:signal-deduplicated` and logs the entry but does not route to any channel.

## Rate limiting

Each channel declares its own rate limit configuration:

```typescript
interface RateLimit {
  maxSignals: number; // Max signals within window
  windowMs: number; // Time window in milliseconds
}
```

Channels without a `rateLimit` property have unlimited throughput. The `UINotification` channel, for example, allows 100 signals per minute since WebSocket events are lightweight.

When a channel is rate-limited, the signal is still logged in the audit log with the channel listed in the `rateLimited` array.

## Acknowledgment flow

Escalations can be acknowledged by humans to close the loop:

1. **Human acknowledges** -- via MCP tool (`acknowledge_escalation`), API, or UI
2. **Router updates log** -- Marks the most recent matching log entry as acknowledged with timestamp and notes
3. **Event emitted** -- `escalation:acknowledged` fires with `{ deduplicationKey, acknowledgedBy, notes }`
4. **Feature unblocked** -- An event subscriber in `event-subscriptions.module.ts` listens for `escalation:acknowledged`, finds the associated blocked feature by deduplication key, and transitions it back to `backlog` with `failureCount` reset

The `clearDedup` option on acknowledgment removes the signal from the dedup window, allowing it to re-fire if the issue recurs.

## Audit log

Every signal processed by the router is recorded in an in-memory audit log (capped at 1,000 entries). Each entry includes:

| Field            | Type     | Description                                |
| ---------------- | -------- | ------------------------------------------ |
| `signal`         | object   | The full `EscalationSignal`                |
| `timestamp`      | string   | ISO 8601 timestamp                         |
| `routedTo`       | string[] | Channels that successfully received signal |
| `deduplicated`   | boolean  | Whether the signal was a duplicate         |
| `rateLimited`    | string[] | Channels that were over rate limit         |
| `acknowledged`   | boolean  | Whether a human acknowledged this signal   |
| `acknowledgedBy` | string   | Who acknowledged it                        |
| `acknowledgedAt` | string   | When it was acknowledged                   |

Access via `escalationRouter.getLog(limit?)` (most recent first).

## Events

| Event                            | Payload                                       | When                            |
| -------------------------------- | --------------------------------------------- | ------------------------------- |
| `escalation:signal-received`     | `EscalationSignal`                            | Signal enters the router        |
| `escalation:signal-routed`       | `{ signal, routedTo, rateLimited }`           | Signal routed to channels       |
| `escalation:signal-sent`         | `{ signal, channel }`                         | Signal delivered to one channel |
| `escalation:signal-failed`       | `{ signal, channel, error }`                  | Channel delivery failed         |
| `escalation:signal-deduplicated` | `{ signal }`                                  | Signal was a duplicate          |
| `escalation:acknowledged`        | `{ deduplicationKey, acknowledgedBy, notes }` | Human acknowledged a signal     |
| `escalation:ui-notification`     | Signal details                                | UINotification channel fired    |

## Configuration

Channel registration happens in `apps/server/src/services/escalation-channels/escalation-channels.module.ts`. To add a new channel:

1. Create a class implementing `EscalationChannel` from `@protolabsai/types`
2. Implement `name`, `canHandle(signal)`, `send(signal)`, and optionally `rateLimit`
3. Register it in the module: `escalationRouter.registerChannel(new MyChannel(...))`

## Key files

| File                                                     | Purpose                          |
| -------------------------------------------------------- | -------------------------------- |
| `libs/types/src/escalation.ts`                           | Signal, severity, source types   |
| `apps/server/src/services/escalation-router.ts`          | Core router with dedup/ratelimit |
| `apps/server/src/services/escalation-channels/*.ts`      | Channel implementations          |
| `apps/server/src/services/event-subscriptions.module.ts` | Acknowledgment subscriber        |

## Related

- [Idea to production](../dev/idea-to-production) -- How escalation fits in the pipeline
- [Reliability and recovery](./reliability) -- Agent failure handling patterns
- [Inbox system](../dev/inbox-system) -- Actionable items created from escalations
