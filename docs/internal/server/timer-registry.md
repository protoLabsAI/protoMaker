# Add a New Timer

This page shows you how to register a new recurring timer with the scheduler. After reading it, you will know how to define a timer, choose the right category, and control it at runtime.

## Prerequisites

- Familiarity with the `SchedulerService` API (see [Ops Control Plane](./ops-control-plane.md))
- Access to a `*.module.ts` file for your service area (see [wiring.ts](./ops-control-plane.md#timer-registry))

## Register an Interval Timer

```typescript
// In your *.module.ts register() function:
import type { ServiceContainer } from '../server/services.js';

export async function register(services: ServiceContainer): Promise<void> {
  const { schedulerService } = services;

  await schedulerService.registerTask(
    'my-feature-cleanup', // unique ID
    'Feature Cleanup', // human-readable name
    '*/15 * * * *', // cron expression: every 15 minutes
    async () => {
      // Your handler logic here
      await cleanupStaleFeatures(services);
    },
    true // enabled by default
  );
}
```

The handler runs when the cron expression matches the current minute. The scheduler checks every 60 seconds.

## Choose a Cron Expression

The cron format is `minute hour dayOfMonth month dayOfWeek`:

| Pattern       | Meaning                      |
| ------------- | ---------------------------- |
| `*/5 * * * *` | Every 5 minutes              |
| `0 * * * *`   | Every hour at minute 0       |
| `0 */6 * * *` | Every 6 hours                |
| `0 0 * * *`   | Daily at midnight            |
| `0 0 * * 1`   | Weekly on Monday at midnight |

Special characters: `*` (any), `,` (list: `1,3,5`), `-` (range: `1-5`), `/` (step: `*/15`).

## Timer Categories

Timers serve different operational purposes. Choose the right category to help operators understand what a timer does at a glance:

| Category      | Purpose                                                  | Typical Interval |
| ------------- | -------------------------------------------------------- | ---------------- |
| `maintenance` | Board health checks, data cleanup, worktree pruning      | 5 min -- 6 hours |
| `health`      | Service health monitoring, memory checks, runner status  | 30 sec -- 5 min  |
| `monitor`     | Stale feature detection, stuck build detection           | 5 -- 30 min      |
| `sync`        | Calendar sync, peer mesh heartbeat, CRDT propagation     | 1 -- 15 min      |
| `system`      | Low-level housekeeping (temp file cleanup, log rotation) | 1 -- 24 hours    |

The category is metadata only -- it does not affect scheduling behavior.

## Pause and Resume a Timer via API

Timers can be paused and resumed at runtime without restarting the server.

**Disable a timer:**

```typescript
await schedulerService.disableTask('my-feature-cleanup');
```

**Re-enable a timer:**

```typescript
await schedulerService.enableTask('my-feature-cleanup');
```

**Update the schedule at runtime:**

```typescript
await schedulerService.updateTaskSchedule('my-feature-cleanup', '*/30 * * * *');
```

All three operations persist the change to `scheduled-tasks.json` and to `schedulerSettings.taskOverrides` in global settings. The override survives server restarts.

## Persist Overrides in Settings

Operators can also set timer overrides directly in global settings via the settings API or MCP `update_settings` tool:

```json
{
  "schedulerSettings": {
    "taskOverrides": {
      "my-feature-cleanup": {
        "enabled": false,
        "cronExpression": "*/30 * * * *"
      }
    }
  }
}
```

These overrides are applied after all tasks register during startup, via `schedulerService.applySettingsOverrides()`.

## Trigger a Timer Manually

For debugging or testing, trigger a timer immediately:

```typescript
const result = await schedulerService.triggerTask('my-feature-cleanup');
// result: { taskId, success, executedAt, duration, error? }
```

## View Timers in the Ops Dashboard

Registered timers appear in the **Timers** tab of the Ops Dashboard. Each timer shows:

- Name and ID
- Cron expression and next scheduled run
- Enabled/disabled state
- Last run time and result
- Execution count and consecutive failure count

## Handle Errors Gracefully

If your handler throws, the scheduler catches the error and:

1. Increments `failureCount` on the task.
2. Records the error message in `lastError`.
3. Emits a `scheduler:task-failed` event.
4. Continues scheduling future runs -- the task is not auto-disabled.

Design your handler to fail fast and provide clear error messages. The scheduler does not implement retry logic -- if you need retries, handle them inside your handler.

## Avoid Common Mistakes

1. **Do not use `setInterval` directly.** Register with the scheduler so the timer is discoverable, controllable, and persisted.
2. **Do not use short intervals for expensive operations.** A 5-second interval that queries the filesystem will create I/O pressure. Use the minimum interval that achieves your operational goal.
3. **Ensure handler idempotency.** The scheduler prevents double-execution within the same minute, but server restarts can cause a handler to run twice in quick succession.
4. **Use unique IDs.** Duplicate IDs will overwrite the previous registration silently.

## Key Files

| File                                            | Role                                      |
| ----------------------------------------------- | ----------------------------------------- |
| `apps/server/src/services/scheduler-service.ts` | Timer registry, cron parsing, persistence |
| `apps/server/src/services/scheduler.module.ts`  | Wiring: registers built-in timers         |
| `apps/server/src/services/maintenance-tasks.ts` | Maintenance task handlers                 |

## Next Steps

- **[Maintenance Checks](./maintenance-checks.md)** -- Create a new check module that runs inside a maintenance sweep
- **[Ops Control Plane](./ops-control-plane.md)** -- Understand the full operational architecture
