# Maintenance Scheduler

The maintenance scheduler runs 8 background tasks on cron schedules for housekeeping — data integrity checks, stale worktree cleanup, branch cleanup, PR auto-merge, and more.

## Settings

Maintenance tasks are controlled via `GlobalSettings.maintenance` in `{DATA_DIR}/settings.json`:

```typescript
interface MaintenanceSettings {
  enabled: boolean; // Master switch (default: true)
  tasks?: Record<string, MaintenanceTaskOverride>;
}

interface MaintenanceTaskOverride {
  enabled?: boolean;
  cronExpression?: string; // 5-field cron format
}
```

Settings are applied at server startup during task registration and can be changed at runtime via the API or UI.

## Registered Tasks

| Task ID                             | Name                        | Default Schedule |
| ----------------------------------- | --------------------------- | ---------------- |
| `maintenance:data-integrity`        | Data Integrity Check        | Every 5 min      |
| `maintenance:stale-features`        | Stale Feature Detection     | Hourly           |
| `maintenance:stale-worktrees`       | Stale Worktree Auto-Cleanup | Daily 3 AM       |
| `maintenance:branch-cleanup`        | Merged Branch Auto-Cleanup  | Sunday 4 AM      |
| `maintenance:board-health`          | Board Health Reconciliation | Every 6 hours    |
| `maintenance:auto-merge-prs`        | Auto-Merge Eligible PRs     | Every 5 min      |
| `maintenance:auto-rebase-stale-prs` | Auto-Rebase Stale PRs       | Every 30 min     |

## API Routes

All routes are under `/api/scheduler/`.

### `GET /status`

Returns all tasks with schedules, execution counts, and next run times.

### `POST /tasks/:taskId/enable`

Enable a task. Persists to `GlobalSettings.maintenance.tasks`.

### `POST /tasks/:taskId/disable`

Disable a task. Persists to `GlobalSettings.maintenance.tasks`.

### `POST /tasks/:taskId/schedule`

Update a task's cron expression. Body: `{ cronExpression: "*/10 * * * *" }`. Validates the expression before applying. Persists to settings.

### `POST /tasks/:taskId/trigger`

Trigger immediate execution of a task regardless of schedule.

## MCP Tools

- **`get_scheduler_status`** — Returns all tasks with schedules and stats.
- **`update_maintenance_task`** — Enable/disable a task or change its cron schedule. Params: `taskId` (required), `enabled`, `cronExpression`.

## UI

The **Settings > System > Maintenance** page shows:

- Scheduler running status and task count summary
- Per-task toggle, inline cron editor with human-readable preview
- Last/next run times, execution and failure counts
- "Run Now" button for immediate execution

## Startup Tasks (Non-Cron)

In addition to cron-scheduled tasks, `maintenance-tasks.ts` exports a startup-only function:

| Function                          | Trigger                             | Purpose                                              |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `scanWorktreesForCrashRecovery()` | Server startup (via `setImmediate`) | Detect and recover stranded work from crashed agents |

This runs once after `resumeInterruptedFeatures()` completes. It lists all worktrees, cross-references with feature statuses, and triggers `runPostCompletionWorkflow()` for verified/done features with uncommitted or unpushed work. See [Reliability & Recovery](../agents/reliability.md#crash-recovery-scan) for details.

## Key Files

- `apps/server/src/services/scheduler-service.ts` — Core scheduler with cron parsing, task execution, persistence
- `apps/server/src/services/maintenance-tasks.ts` — Task registration and settings override application
- `apps/server/src/routes/scheduler/` — API route handlers
- `packages/mcp-server/src/tools/scheduler-tools.ts` — MCP tool definitions
- `apps/ui/src/components/views/settings-view/maintenance/` — UI section
- `libs/types/src/settings.ts` — `MaintenanceSettings`, `MaintenanceTaskOverride` types
