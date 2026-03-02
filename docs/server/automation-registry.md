# Automations

The Automations system provides a unified control plane for defining, scheduling, monitoring, and manually triggering automation flows. Automations reference named flows in the FlowRegistry and can run on cron schedules, in response to events, or on demand.

## Architecture

```
Settings > Automations (UI)
    |
REST API (/api/automations)
    |
AutomationService
    |-- FlowRegistry (Map<flowId, FlowFactory>)
    |-- SchedulerService (cron task registration)
    |-- JSON storage (automations.json, automation-runs.json)
```

**AutomationService** (`apps/server/src/services/automation-service.ts`):

- Stores automation definitions in `{DATA_DIR}/automations.json`
- Stores run history in `{DATA_DIR}/automation-runs.json`
- Registers enabled cron automations with `SchedulerService` at startup via `syncWithScheduler()`
- Executes flows by looking up the `flowId` in the global `flowRegistry`
- Seeds built-in maintenance automations on startup (see [Built-In Automations](#built-in-automations))

**SchedulerService** (`apps/server/src/services/scheduler-service.ts`):

- Core cron scheduler with task registration, execution, and next-run tracking
- Used internally by AutomationService — not exposed via its own API

**FlowRegistry**: A process-scoped `Map<string, FlowFactory>` (singleton). Services register flows at startup using `flowRegistry.register(flowId, factory)`. The factory receives the automation's `modelConfig` at execution time.

## UI

The automations control plane is located at **Settings > System > Automations**. It consolidates all automation management into a single table view.

### Table Columns

| Column   | Description                                                            |
| -------- | ---------------------------------------------------------------------- |
| Name     | Automation name with lock icon for built-in tasks                      |
| Trigger  | Human-readable cron schedule with next-run countdown, or event/webhook |
| Flow     | The `flowId` that runs when triggered                                  |
| Model    | AI model alias (Opus, Sonnet, Haiku) if configured                     |
| Last Run | Status badge (Success/Failed/Running) with relative timestamp          |
| Enabled  | Toggle switch for enable/disable                                       |
| Actions  | History, Run Now, Edit, Delete buttons                                 |

### Actions

- **Toggle switch** — Enable or disable any automation. Changes persist immediately via the API. Built-in tasks can be disabled.
- **Run Now** (play icon) — Triggers immediate execution of the automation's flow, bypassing the cron schedule. Shows a spinner while running.
- **History** (clock icon) — Expands an inline sub-table showing the last 10 runs with timestamp, duration, status, error message, and a Langfuse trace link for observability.
- **Edit** (pencil icon) — Opens a modal to edit the automation's name, trigger, flow, model config, and enabled state.
- **Delete** (trash icon) — Deletes user-created automations. Built-in automations cannot be deleted.
- **New Automation** — Creates a custom automation with a cron, event, or webhook trigger.

### Run History Panel

Clicking the History icon on any automation row expands an inline panel showing recent execution history:

| Column   | Description                                          |
| -------- | ---------------------------------------------------- |
| Started  | Timestamp of when the run began                      |
| Duration | Elapsed time (e.g., `2s`, `1m 30s`)                  |
| Status   | Success, Failed, Running, or Cancelled               |
| Error    | Error message for failed runs (truncated with hover) |
| Trace    | Link to the Langfuse trace for the run (if traceId)  |

History is capped at 50 runs per automation. The panel shows the most recent 10.

## Built-In Automations

The following automations are seeded automatically at server startup. They appear in the UI with a lock icon and cannot be deleted, but they can be disabled or have their schedules changed.

### Cron-Scheduled Tasks

| ID                                  | Name                         | Schedule      | Description                                           |
| ----------------------------------- | ---------------------------- | ------------- | ----------------------------------------------------- |
| `maintenance:data-integrity`        | Data Integrity Check         | Every 5 min   | Monitors feature directory count and data consistency |
| `maintenance:stale-features`        | Stale Feature Detection      | Hourly        | Finds features stuck in running/in-progress > 2 hours |
| `maintenance:stale-worktrees`       | Stale Worktree Auto-Cleanup  | Daily 3 AM    | Auto-removes worktrees for merged branches            |
| `maintenance:branch-cleanup`        | Merged Branch Auto-Cleanup   | Sunday 4 AM   | Auto-deletes local branches already merged to main    |
| `maintenance:board-health`          | Board Health Reconciliation  | Every 6 hours | Audits and auto-fixes board state inconsistencies     |
| `maintenance:auto-merge-prs`        | Auto-Merge Eligible PRs      | Every 5 min   | Merges PRs that pass all eligibility checks           |
| `maintenance:auto-rebase-stale-prs` | Auto-Rebase Stale PRs        | Every 30 min  | Rebases PRs that are behind their base branch         |
| `maintenance:runner-health`         | GitHub Actions Runner Health | Every 5 min   | Monitors runner health and detects stuck builds       |

Conditional registration: `data-integrity` requires `IntegrityWatchdogService`, `board-health` requires `FeatureHealthService`, `auto-merge-prs` and `auto-rebase-stale-prs` require `FeatureLoader` + `SettingsService`, `runner-health` requires GitHub env vars (`GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`).

### Event-Triggered Tasks

| ID                       | Name                           | Event                       | Description                               |
| ------------------------ | ------------------------------ | --------------------------- | ----------------------------------------- |
| `ceremony:standup`       | Standup Ceremony               | `feature:completed`         | Runs standup flow when a feature finishes |
| `ceremony:retro`         | Retrospective Ceremony         | `ceremony:milestone-update` | Runs retro flow on milestone updates      |
| `ceremony:project-retro` | Project Retrospective Ceremony | `ceremony:project-retro`    | Runs project retro flow when triggered    |

### Startup Tasks (Non-Automation)

In addition to automations, the scheduler module runs a one-time startup scan:

| Function                          | Trigger                             | Purpose                                              |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `scanWorktreesForCrashRecovery()` | Server startup (via `setImmediate`) | Detect and recover stranded work from crashed agents |

This runs once after `resumeInterruptedFeatures()` completes. See [Reliability & Recovery](../agents/reliability.md#crash-recovery-scan) for details.

## REST API

Base path: `/api/automations`

All requests require the standard `X-API-Key` header.

### Endpoints

| Method   | Path           | Description                       |
| -------- | -------------- | --------------------------------- |
| `GET`    | `/list`        | List all automations              |
| `GET`    | `/:id`         | Get a single automation by ID     |
| `POST`   | `/create`      | Create a new automation           |
| `PUT`    | `/:id`         | Update an automation              |
| `DELETE` | `/:id`         | Delete an automation              |
| `GET`    | `/:id/history` | Get run history for an automation |
| `POST`   | `/:id/run`     | Manually trigger an automation    |

### GET /list

Returns all automations including built-in maintenance tasks.

```json
{
  "automations": [
    {
      "id": "maintenance:stale-features",
      "name": "Stale Feature Detection",
      "flowId": "built-in:stale-features",
      "trigger": { "type": "cron", "expression": "0 * * * *" },
      "enabled": true,
      "isBuiltIn": true,
      "lastRunAt": "2026-03-01T12:00:01.234Z",
      "lastRunStatus": "success",
      "nextRunAt": "2026-03-01T13:00:00.000Z",
      "modelConfig": null,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST /create

Creates a new automation. Immediately registered with the scheduler if it has a cron trigger and `enabled: true`.

**Request body:**

```json
{
  "name": "Nightly Cleanup",
  "flowId": "cleanup-flow",
  "trigger": {
    "type": "cron",
    "expression": "0 3 * * *"
  },
  "enabled": true,
  "description": "Optional description",
  "modelConfig": { "model": "haiku" }
}
```

**Trigger types:**

| Type      | Fields                             | Notes                                      |
| --------- | ---------------------------------- | ------------------------------------------ |
| `cron`    | `expression` (5-field cron string) | Registered with SchedulerService           |
| `event`   | `eventType` (string)               | Fires on matching server event             |
| `webhook` | `path` (string)                    | Stored only; webhook routing not yet wired |

Returns `201` with the created automation object.

### PUT /:id

Updates any field on an automation. Scheduler registration syncs automatically:

- Enabling a cron automation registers it with the scheduler
- Disabling a cron automation removes it from the scheduler
- Changing the cron expression updates the schedule
- Switching from cron to another trigger type unregisters the scheduler task

**Request body (all fields optional):**

```json
{
  "enabled": false,
  "trigger": { "type": "cron", "expression": "0 4 * * *" }
}
```

### GET /:id/history

Returns run records sorted newest-first. History is capped at 50 runs per automation.

```json
{
  "runs": [
    {
      "id": "run-uuid",
      "automationId": "maintenance:stale-features",
      "status": "success",
      "startedAt": "2026-03-01T12:00:00.000Z",
      "completedAt": "2026-03-01T12:00:01.234Z",
      "error": null,
      "traceId": "abc123-langfuse-trace-id"
    }
  ]
}
```

Run status values: `running`, `success`, `failure`, `cancelled`.

### POST /:id/run

Manually triggers the automation, bypassing the cron schedule. The flow referenced by `flowId` must be registered in the FlowRegistry. Returns the run record.

### DELETE /:id

Deletes a user-created automation. Built-in automations (`isBuiltIn: true`) cannot be deleted.

## MCP Tools

Two MCP tools are available for programmatic automation management:

- **`get_scheduler_status`** — Returns all registered tasks with their schedules, enable/disable state, execution counts, and next run times.
- **`update_maintenance_task`** — Enable/disable a task or change its cron schedule. Params: `taskId` (required), `enabled` (optional boolean), `cronExpression` (optional 5-field cron string).

## Registering Custom Flows

Flows must be registered in the FlowRegistry before automations can reference them. Register flows at server startup:

```typescript
import { flowRegistry } from '../services/automation-service.js';

flowRegistry.register('my-flow', async (modelConfig) => {
  const model = (modelConfig?.model as string) ?? 'sonnet';
  // ... run the flow
});
```

The `modelConfig` object comes from the automation definition and is passed through to the factory at execution time.

## Data Storage

| File                              | Contents                                            |
| --------------------------------- | --------------------------------------------------- |
| `{DATA_DIR}/automations.json`     | Array of automation definitions (built-in + custom) |
| `{DATA_DIR}/automation-runs.json` | Array of run records (capped at 50 per automation)  |

`DATA_DIR` defaults to `./data`. See [Environment Variables](/getting-started/env-vars.md).

## Key Files

| File                                                      | Purpose                               |
| --------------------------------------------------------- | ------------------------------------- |
| `apps/server/src/services/automation-service.ts`          | Core service, flow registry, CRUD     |
| `apps/server/src/services/scheduler-service.ts`           | Cron scheduler engine                 |
| `apps/server/src/services/maintenance-tasks.ts`           | Built-in task handler functions       |
| `apps/server/src/services/scheduler.module.ts`            | Startup wiring and sync               |
| `apps/server/src/routes/automations/`                     | REST API route handlers               |
| `apps/ui/src/components/views/settings-view/automations/` | UI components (table, modal, history) |
| `packages/mcp-server/src/tools/scheduler-tools.ts`        | MCP tool definitions                  |
| `libs/types/src/automation.ts`                            | TypeScript types                      |
