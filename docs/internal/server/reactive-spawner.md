# ReactiveSpawnerService

Trigger-based agent spawning with rate limiting, deduplication, and circuit breaking.

## Overview

`ReactiveSpawnerService` spawns Ava agents in response to three trigger categories:

| Category  | Method                         | Description                                 |
| --------- | ------------------------------ | ------------------------------------------- |
| `message` | `spawnForMessage(msg)`         | React to an incoming `AvaChatMessage`       |
| `error`   | `spawnForError(ctx)`           | Investigate and remediate an `ErrorContext` |
| `cron`    | `spawnForCron(taskName, desc)` | Execute a scheduled task                    |

## Budget Controls

- **maxConcurrent=1** per category — prevents overlapping runs in the same lane
- **maxSessionsPerHour=3** — global hourly cap, resets each hour
- **Error deduplication** — identical errors (same `errorType + message`) are skipped within a 1-hour window
- **CircuitBreaker** per category — after 3 consecutive failures the circuit opens for 5 minutes

## ErrorContext

```ts
interface ErrorContext {
  message: string; // Human-readable error message (required)
  errorType?: string; // Classifier, e.g. 'high_memory_usage', 'feature_failure'
  code?: string; // Node.js ErrnoException code, e.g. 'ENOENT'
  stack?: string; // Stack trace (alias for stackTrace)
  stackTrace?: string; // Stack trace
  featureId?: string; // Feature ID associated with the error
  severity?: 'low' | 'medium' | 'critical';
  metadata?: Record<string, unknown>;
}
```

## Error-Trigger Patterns

Three system components call `spawnForError()` to trigger self-healing:

### 1. HealthMonitorService — High Memory or Critical Check Failure

**File:** `apps/server/src/services/health-monitor-service.ts`

Triggers when:

- Heap usage exceeds **90%** (`MEMORY_SPAWN_THRESHOLD = 0.9`)
- Any health check issue is classified as `severity: 'critical'`

```ts
spawner.spawnForError({
  errorType: 'high_memory_usage',
  message: `Server memory usage is critically high: 92% of heap used (...)`,
  severity: 'critical',
});
```

The call is fire-and-forget (errors are caught and logged). The `ReactiveSpawnerService`
singleton may not be initialized in test environments — the call is wrapped in a try/catch
that silently skips if the service is unavailable.

### 2. AutoMode ExecutionService — Feature failureCount Reaches 2

**File:** `apps/server/src/services/auto-mode/execution-service.ts`

Triggers when a feature's `failureCount` increments to exactly **2** (i.e. after the second
distinct failure, not on retries within a single run).

```ts
spawner.spawnForError({
  errorType: 'feature_failure',
  message: `Feature "My Feature" has failed 2 times. Last error: <last error message>`,
  featureId: '<featureId>',
  severity: 'medium',
  metadata: {
    worktreePath: '/path/to/worktree',
    failureCount: 2,
    errorType: 'tool_error',
  },
});
```

The spawned Ava session receives the feature ID, last error, and worktree path. It is
instructed to either fix the root cause or file a bug ticket if a PR is needed.

### 3. Server shutdown.ts — Fatal uncaughtException

**File:** `apps/server/src/server/shutdown.ts`

Triggers for any `uncaughtException` that is **not** in the non-fatal list
(`ECONNRESET`, `EPIPE`, `ERR_STREAM_DESTROYED`, `ERR_STREAM_WRITE_AFTER_END`).

The call fires **before** the graceful shutdown sequence begins:

```ts
spawner.spawnForError({
  errorType: 'uncaught_exception',
  message: error.message,
  stackTrace: error.stack,
  severity: 'critical',
});
```

Because the process is about to exit, the spawner call is non-blocking (fire-and-forget).
The graceful shutdown proceeds immediately after.

## Spawned Session Prompt

All `spawnForError` calls produce a prompt that includes:

1. Error details (type, message, severity, feature ID, stack trace)
2. A directive to **fix the root cause** if possible
3. A directive to **file a bug ticket on the board** if fixing requires a PR
4. An explicit instruction **NOT to restart the dev server**

## Cron-Trigger Patterns

Three built-in Ava cron tasks call `spawnForCron()` via `registerAvaCronTasks()`.

**File:** `apps/server/src/services/ava-cron-tasks.ts`
**Registered in:** `apps/server/src/server/services.ts` after `ReactiveSpawnerService` is initialized.

| Task ID                  | Schedule       | Purpose                                                                                                                             |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ava-daily-board-health` | `0 9 * * *`    | Check for stale features (>24h no activity), blocked agents, open PRs with failing CI — file tickets for anything needing attention |
| `ava-pr-triage`          | `0 */4 * * *`  | Scan open PRs for CodeRabbit threads, CI failures, merge conflicts — act or file tickets                                            |
| `ava-staging-ping`       | `*/30 * * * *` | Post a capacity_heartbeat to the Ava Channel; alert if staging has been quiet >2h                                                   |

### Calendar Reminder Integration

`CalendarService` exposes an `onReminder(callback)` method backed by a Node.js `EventEmitter`.
When a calendar event is due (fired via `calendarService.emitReminder(payload)`), the wiring
in `services.ts` calls `reactiveSpawnerService.spawnForCron(title, description)` automatically.

```ts
calendarService.onReminder((payload) => {
  void reactiveSpawnerService.spawnForCron(payload.title, payload.description);
});
```

This connects one-time calendar job events to the same cron rate-limiting and circuit-breaking
budget controls as the recurring tasks above.

## Circuit Breaker Behavior

Each trigger category has its own circuit breaker:

- **Failure threshold:** 3 consecutive spawn failures → circuit opens
- **Cooldown:** 5 minutes before the circuit half-opens

When the circuit is open, `spawnForError` returns immediately with
`{ spawned: false, skippedReason: 'circuit_open', category: 'error' }`.

This prevents cascade loops where a broken Ava session keeps getting re-spawned.
