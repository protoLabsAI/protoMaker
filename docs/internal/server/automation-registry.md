# Automations

The Automations system provides a unified control plane for defining, scheduling, monitoring, and alerting on automation flows. Automations reference named flows in the FlowRegistry and can run on cron schedules, in response to events, or on demand.

## Architecture

The system has three layers, each with a distinct responsibility:

```
Settings > Automations (UI)
    |
    |-- SchedulerHealthGrid (live task status cards)
    |-- Automations Table (CRUD, run, history)
    |
REST API (/api/automations)
    |
    |-- /list, /create, /:id, /:id/run, /:id/history
    |-- /scheduler/status  <-- scheduler health endpoint
    |
AutomationService (CRUD layer)
    |-- FlowRegistry (Map<flowId, FlowFactory>)
    |-- JSON storage (automations.json, automation-runs.json)
    |
SchedulerService (cron engine)
    |-- Task registration, cron scheduling, execution tracking
    |-- SchedulerSettings persistence (GlobalSettings)
    |-- scheduler:task-failed event emission
    |
Maintenance Tasks (business logic)
    |-- 8 built-in flows registered via FlowRegistry at startup
    |-- Branch-aware PR tasks (resolveIntegrationBranch)
```

### Layer 1: SchedulerService (Cron Engine)

**File:** `apps/server/src/services/scheduler-service.ts` (~868 lines)

The low-level cron engine. It knows nothing about automations, flows, or business logic — it just registers named tasks with cron expressions and fires them on schedule. Tracks per-task stats: `nextRun`, `lastRun`, `executionCount`, `lastError`, `averageDurationMs`, `failureCount`.

Key methods:

- `registerTask(id, name, cronExpression, handler)` — Register a task
- `enableTask(id)` / `disableTask(id)` — Toggle task
- `updateTaskSchedule(id, cronExpression)` — Change schedule
- `getStatus()` — Returns all task states (used by the REST endpoint and MCP)
- `start()` — Reads persisted `SchedulerSettings` overrides and applies them

When a task handler throws, SchedulerService catches the error, increments `failureCount`, and emits a `scheduler:task-failed` event (see [Failure Alerting](#failure-alerting)).

### Layer 2: AutomationService (CRUD Layer)

**File:** `apps/server/src/services/automation-service.ts` (~697 lines)

The CRUD and orchestration layer. Manages automation definitions (JSON), seeds built-in automations at startup, and bridges between the REST API and SchedulerService.

- Stores automation definitions in `{DATA_DIR}/automations.json`
- Stores run history in `{DATA_DIR}/automation-runs.json`
- Registers enabled cron automations with SchedulerService at startup via `syncWithScheduler()`
- Executes flows by looking up the `flowId` in the global `flowRegistry`
- Seeds built-in maintenance automations on startup (see [Built-In Automations](#built-in-automations))

### Layer 3: Maintenance Tasks (Business Logic)

**File:** `apps/server/src/services/maintenance-tasks.ts` (~1000+ lines)

The actual handler functions for the 8 built-in scheduled tasks. Each handler is registered as a flow factory in the FlowRegistry at startup via `registerMaintenanceFlows()`. These are the functions that do real work — merge PRs, clean worktrees, audit the board, etc.

**FlowRegistry:** A process-scoped `Map<string, FlowFactory>` (singleton). Services register flows at startup using `flowRegistry.register(flowId, factory)`. The factory receives the automation's `modelConfig` at execution time.

## Scheduler Settings Persistence

Built-in task configuration (enabled state, cron overrides) is persisted in GlobalSettings so it survives server restarts.

### SchedulerSettings Type

```typescript
// libs/types/src/global-settings.ts
export interface SchedulerSettings {
  /** Per-task overrides. Key: task ID (e.g., "maintenance:auto-merge-prs") */
  taskOverrides: Record<
    string,
    {
      enabled?: boolean;
      cronExpression?: string;
    }
  >;
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  taskOverrides: {},
};
```

### How It Works

1. On startup, `SchedulerService.start()` reads `schedulerSettings.taskOverrides` from GlobalSettings and applies them after registering tasks.
2. When a built-in task is enabled/disabled or has its schedule changed (via API or MCP), SchedulerService writes the override back to GlobalSettings via `settingsService`.
3. On next restart, the overrides are re-applied — the task stays in the state the operator set.

### Storage Location

The `schedulerSettings` field lives inside `data/settings.json` under the top-level GlobalSettings object:

```json
{
  "schedulerSettings": {
    "taskOverrides": {
      "maintenance:auto-merge-prs": { "enabled": false },
      "maintenance:stale-worktrees": { "cronExpression": "0 2 * * *" }
    }
  }
}
```

## Timer Registry

The Timer Registry is a unified view of all managed timers in the server — both cron-based scheduled tasks and interval-based polling timers. It is provided by `SchedulerService` and exposed via `/api/ops/timers`.

### What It Tracks

Before the Timer Registry, interval timers (used by monitoring services like `HealthMonitorService`, `GitHubMonitor`, and `LeadEngineerService`) were invisible — they existed only as raw `setInterval` handles with no observability. The Timer Registry makes all running timers inspectable from a single endpoint.

| Timer type | Example consumers                                                                                                             | Schedule type              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `cron`     | All maintenance tasks (e.g. `maintenance:auto-merge-prs`)                                                                     | 5-field cron expression    |
| `interval` | `HealthMonitorService`, `DiscordMonitor`, `GitHubMonitor`, `LeadEngineerService`, `PRWatcherService`, `SpecGenerationMonitor` | Fixed millisecond interval |

### SchedulerService — Timer Registry Methods

In addition to the cron task methods documented above, `SchedulerService` exposes:

```typescript
// Register a managed setInterval under a named id.
// If an interval with the same id already exists, it is replaced.
registerInterval(id: string, name: string, intervalMs: number, handler: () => Promise<void> | void): void

// Remove a managed interval registered via registerInterval().
// Returns true if found and removed, false otherwise.
unregisterInterval(id: string): boolean

// Returns all timers — both cron tasks and interval entries — as a unified list.
listAll(): TimerEntry[]

// Get a specific cron task by id.
getTask(id: string): ScheduledTask | undefined

// Get all cron tasks.
getAllTasks(): ScheduledTask[]
```

### Registering Services

Monitoring services opt in to the Timer Registry by accepting an optional `SchedulerService` dependency via `setSchedulerService()`. When wired in, the service's `registerInterval()` calls route through `SchedulerService` instead of raw `setInterval`:

```typescript
// In scheduler.module.ts — wired at startup
healthMonitorService.setSchedulerService(schedulerService);
specGenerationMonitor.setSchedulerService(schedulerService);
prWatcherService.setSchedulerService(schedulerService);
leadEngineerService.setSchedulerService(schedulerService);
githubMonitor.setSchedulerService(schedulerService);
discordMonitor.setSchedulerService(schedulerService);
```

If `schedulerService` is unavailable (e.g. in unit tests), services fall back to raw `setInterval` — no behavioral change, just no centralized tracking.

### Interval Timer IDs

| Service                 | Timer ID pattern                                                                | Purpose                                  |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `HealthMonitorService`  | `health-monitor:*`                                                              | Server health polling                    |
| `SpecGenerationMonitor` | `spec-generation-monitor:*`                                                     | Spec generation polling                  |
| `PRWatcherService`      | `pr-watcher:*`                                                                  | PR status polling                        |
| `GitHubMonitor`         | `github-monitor:poll`                                                           | GitHub PR label polling                  |
| `DiscordMonitor`        | `discord-monitor:channel:{channelId}`                                           | Discord channel polling                  |
| `LeadEngineerService`   | `lead-engineer:{projectPath}:refresh`, `lead-engineer:{projectPath}:supervisor` | Per-project refresh and supervisor loops |

### TypeScript Types

Defined in `libs/types/src/scheduler.ts`:

```typescript
export type TimerCategory = 'maintenance' | 'health' | 'monitor' | 'sync' | 'system';
export type TimerType = 'cron' | 'interval';

export interface TimerRegistryEntry {
  id: string;
  name: string;
  type: TimerType;
  intervalMs?: number; // set for type === 'interval'
  expression?: string; // set for type === 'cron'
  enabled: boolean;
  lastRun?: string; // ISO timestamp
  nextRun?: string; // ISO timestamp (cron only)
  duration?: number; // last execution duration in ms
  failureCount: number;
  executionCount: number;
  category: TimerCategory;
}

export interface TimerRegistryMetrics {
  totalTimers: number;
  enabledTimers: number;
  pausedTimers: number;
  totalExecutions: number;
  totalFailures: number;
  byCategory: Record<TimerCategory, number>;
  byType: Record<TimerType, number>;
}
```

### Timer Registry REST API

Base path: `/api/ops/timers`

All requests require the standard `X-API-Key` header.

| Method | Path          | Description                       |
| ------ | ------------- | --------------------------------- |
| `GET`  | `/`           | List all timers (cron + interval) |
| `POST` | `/:id/pause`  | Pause a specific cron timer       |
| `POST` | `/:id/resume` | Resume a specific cron timer      |
| `POST` | `/pause-all`  | Pause all enabled cron timers     |
| `POST` | `/resume-all` | Resume all paused cron timers     |

#### GET /api/ops/timers

Returns a unified list of all cron tasks and interval timers.

```json
{
  "timers": [
    {
      "kind": "cron",
      "id": "maintenance:auto-merge-prs",
      "name": "Auto-Merge Eligible PRs",
      "enabled": true,
      "cronExpression": "*/5 * * * *",
      "nextRun": "2026-03-15T18:10:00.000Z",
      "lastRun": "2026-03-15T18:05:01.234Z",
      "executionCount": 312,
      "failureCount": 0
    },
    {
      "kind": "interval",
      "id": "github-monitor:poll",
      "name": "GitHub PR Monitor",
      "intervalMs": 60000,
      "registeredAt": "2026-03-15T17:00:00.000Z"
    }
  ],
  "count": 2
}
```

#### POST /api/ops/timers/:id/pause

Pauses a cron task by ID. If the task is already paused, returns `{ success: true, message: "Timer is already paused" }` without error. Interval timers cannot be paused via this endpoint — they must be stopped by their owning service.

#### POST /api/ops/timers/pause-all and /resume-all

Bulk pause/resume all cron tasks. Returns `{ success: true, pausedCount: N }` or `{ success: true, resumedCount: N }`.

### Timer Events

The timer routes emit events on every state change:

| Event               | When emitted            | Payload                                   |
| ------------------- | ----------------------- | ----------------------------------------- |
| `timer:paused`      | A cron timer is paused  | `{ timerId, timerName, kind, timestamp }` |
| `timer:resumed`     | A cron timer is resumed | `{ timerId, timerName, kind, timestamp }` |
| `timer:all-paused`  | Bulk pause completes    | `{ count, timestamp }`                    |
| `timer:all-resumed` | Bulk resume completes   | `{ count, timestamp }`                    |

These events are broadcast to WebSocket clients, allowing the UI to react to timer state changes in real time.

**Route handler files:**

- `apps/server/src/routes/ops/index.ts`
- `apps/server/src/routes/ops/routes/timers.ts`

## UI

The automations control plane is located at **Settings > System > Automations**. It has two sections:

### Scheduler Health Grid

A collapsible "System Tasks" panel at the top of the Automations page showing live status cards for all registered scheduler tasks.

**File:** `apps/ui/src/components/views/settings-view/automations/scheduler-health-grid.tsx`

Each card shows:

| Element               | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| Task name             | The human-readable task name                                               |
| Enabled badge         | Green/gray badge indicating whether the task is active                     |
| Next-run countdown    | Relative time until next execution (e.g., "in 4m 23s"), updates reactively |
| Last-run result badge | Green check on success, red X on failure with error tooltip on hover       |
| Execution count       | Total number of times the task has run since server start                  |

Tasks that have never run show "N/A" for last-run.

**Data source:** The `useSchedulerStatus()` hook (`apps/ui/src/hooks/use-scheduler-status.ts`) polls `GET /api/automations/scheduler/status` every 30 seconds. The hook returns:

```typescript
interface SchedulerTask {
  id: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  nextRun: string | null;
  lastRun: string | null;
  executionCount: number;
  lastError: string | null;
  averageDurationMs: number | null;
}
```

### Automations Table

The full CRUD table below the health grid. Consolidates all automation management into a single table view.

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

- **Toggle switch** — Enable or disable any automation. Changes persist immediately via the API and are written to SchedulerSettings. Built-in tasks can be disabled.
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

The following automations are seeded automatically at server startup. They appear in the UI with a lock icon and cannot be deleted, but they can be disabled or have their schedules changed. Configuration changes persist across restarts via SchedulerSettings.

### Cron-Scheduled Tasks

| ID                                  | Name                         | Schedule      | Branch-Aware | Description                                           |
| ----------------------------------- | ---------------------------- | ------------- | ------------ | ----------------------------------------------------- |
| `maintenance:data-integrity`        | Data Integrity Check         | Every 5 min   | No           | Monitors feature directory count and data consistency |
| `maintenance:stale-features`        | Stale Feature Detection      | Hourly        | No           | Finds features stuck in running/in-progress > 2 hours |
| `maintenance:stale-worktrees`       | Stale Worktree Auto-Cleanup  | Daily 3 AM    | Yes          | Auto-removes worktrees for merged branches            |
| `maintenance:branch-cleanup`        | Merged Branch Auto-Cleanup   | Sunday 4 AM   | Yes          | Auto-deletes local branches already merged to target  |
| `maintenance:board-health`          | Board Health Reconciliation  | Every 6 hours | No           | Audits and auto-fixes board state inconsistencies     |
| `maintenance:auto-merge-prs`        | Auto-Merge Eligible PRs      | Every 5 min   | Yes          | Merges PRs targeting the integration branch           |
| `maintenance:auto-rebase-stale-prs` | Auto-Rebase Stale PRs        | Every 30 min  | Yes          | Rebases PRs behind their base branch                  |
| `maintenance:runner-health`         | GitHub Actions Runner Health | Every 5 min   | No           | Monitors runner health and detects stuck builds       |

Conditional registration: `data-integrity` requires `IntegrityWatchdogService`, `board-health` requires `FeatureHealthService`, `auto-merge-prs` and `auto-rebase-stale-prs` require `FeatureLoader` + `SettingsService`, `runner-health` requires GitHub env vars (`GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`).

### Branch-Aware PR Tasks

Tasks marked "Branch-Aware" in the table above call `resolveIntegrationBranch()` to determine the correct target branch from the project's `gitWorkflow.prBaseBranch` setting (defaults to `dev`). This means:

- **`auto-merge-prs`** only merges PRs whose base branch matches the configured integration branch
- **`auto-rebase-stale-prs`** only rebases PRs targeting the configured integration branch
- **`stale-worktrees`** and **`branch-cleanup`** use the integration branch when determining which branches are safe to clean

Tasks that don't operate on git branches (data-integrity, stale-features, board-health, runner-health) are unaffected.

The `resolveIntegrationBranch()` function reads `prBaseBranch` from `settingsService` and falls back to `main` then `master` if the configured branch doesn't exist on the remote.

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

This runs once after `resumeInterruptedFeatures()` completes. See [Reliability & Recovery](../../concepts/reliability.md#crash-recovery-scan) for details.

## Failure Alerting

When a scheduled task throws an error during execution, SchedulerService emits a `scheduler:task-failed` event. This event is routed through three channels:

### Event Payload

```typescript
{
  type: 'scheduler:task-failed',
  payload: {
    taskId: string;      // e.g., "maintenance:auto-merge-prs"
    taskName: string;    // e.g., "Auto-Merge Eligible PRs"
    error: string;       // Error message from the thrown exception
    timestamp: string;   // ISO 8601 timestamp of when the failure occurred
  }
}
```

### Routing

| Channel            | Mechanism                                 | Latency      | Condition                      |
| ------------------ | ----------------------------------------- | ------------ | ------------------------------ |
| **WebSocket**      | Broadcast to all connected UI clients     | Immediate    | Always                         |
| **UI Toast**       | Toast notification in automations section | < 60 seconds | Client subscribed to WebSocket |
| **Discord #infra** | Message to channel `1469109809939742814`  | Immediate    | `DISCORD_TOKEN` env var is set |

Discord routing is non-fatal — if the bot is unavailable or the token isn't configured, the warning is logged but the event still flows to WebSocket and the UI.

### Implementation

- **Emission:** `scheduler-service.ts` catches task handler errors, increments `failureCount`, and calls `this.emitEvent('scheduler:task-failed', payload)`.
- **WebSocket broadcast:** `websockets.ts` listens for the event and forwards it to all connected clients.
- **Discord routing:** `websockets.ts` sends a formatted message to `#infra` via `discordBotService.sendToChannel()`.
- **UI subscription:** `automations-section.tsx` subscribes to the WebSocket event and shows a toast notification using the existing toast system.

## REST API

Base path: `/api/automations`

All requests require the standard `X-API-Key` header.

### Endpoints

| Method   | Path                | Description                       |
| -------- | ------------------- | --------------------------------- |
| `GET`    | `/list`             | List all automations              |
| `GET`    | `/scheduler/status` | Get all scheduler task states     |
| `GET`    | `/:id`              | Get a single automation by ID     |
| `POST`   | `/create`           | Create a new automation           |
| `PUT`    | `/:id`              | Update an automation              |
| `DELETE` | `/:id`              | Delete an automation              |
| `GET`    | `/:id/history`      | Get run history for an automation |
| `POST`   | `/:id/run`          | Manually trigger an automation    |

### GET /scheduler/status

Returns the current state of all registered scheduler tasks. This is the data source for the Scheduler Health Grid UI component and the `get_scheduler_status` MCP tool.

```json
{
  "tasks": [
    {
      "id": "maintenance:stale-features",
      "name": "Stale Feature Detection",
      "enabled": true,
      "cronExpression": "0 * * * *",
      "nextRun": "2026-03-05T13:00:00.000Z",
      "lastRun": "2026-03-05T12:00:01.234Z",
      "executionCount": 47,
      "lastError": null,
      "averageDurationMs": 1250
    }
  ]
}
```

**Route handler:** `apps/server/src/routes/automations/routes/scheduler-status.ts`

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
- Changes to built-in tasks are persisted in SchedulerSettings

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

- **`get_scheduler_status`** — Returns all registered tasks with their schedules, enable/disable state, execution counts, and next run times. Equivalent to `GET /api/automations/scheduler/status`.
- **`update_maintenance_task`** — Enable/disable a task or change its cron schedule. Params: `taskId` (required), `enabled` (optional boolean), `cronExpression` (optional 5-field cron string). Changes are persisted in SchedulerSettings.

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

| File                              | Contents                                                 |
| --------------------------------- | -------------------------------------------------------- |
| `{DATA_DIR}/automations.json`     | Array of automation definitions (built-in + custom)      |
| `{DATA_DIR}/automation-runs.json` | Array of run records (capped at 50 per automation)       |
| `{DATA_DIR}/settings.json`        | GlobalSettings including `schedulerSettings` (overrides) |

`DATA_DIR` defaults to `./data`. See [Getting Started](/getting-started/) for environment setup.

## Key Files

| File                                                                               | Purpose                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/server/src/services/automation-service.ts`                                   | CRUD layer, flow registry, automation sync                      |
| `apps/server/src/services/scheduler-service.ts`                                    | Cron engine, task execution, event emission                     |
| `apps/server/src/services/maintenance-tasks.ts`                                    | Built-in task handler functions                                 |
| `apps/server/src/services/scheduler.module.ts`                                     | Startup wiring and settings injection                           |
| `apps/server/src/routes/automations/`                                              | REST API route handlers                                         |
| `apps/server/src/routes/automations/routes/scheduler-status.ts`                    | Scheduler status endpoint handler                               |
| `apps/server/src/server/websockets.ts`                                             | WebSocket broadcast + Discord routing                           |
| `apps/ui/src/hooks/use-scheduler-status.ts`                                        | Scheduler status polling hook (30s)                             |
| `apps/ui/src/components/views/settings-view/automations/`                          | UI components (table, modal, history, grid)                     |
| `apps/ui/src/components/views/settings-view/automations/scheduler-health-grid.tsx` | Health grid component                                           |
| `packages/mcp-server/src/tools/scheduler-tools.ts`                                 | MCP tool definitions                                            |
| `libs/types/src/automation.ts`                                                     | TypeScript types                                                |
| `libs/types/src/scheduler.ts`                                                      | Timer Registry types (TimerRegistryEntry, TimerRegistryMetrics) |
| `apps/server/src/routes/ops/index.ts`                                              | Ops route module                                                |
| `apps/server/src/routes/ops/routes/timers.ts`                                      | Timer Registry REST endpoints                                   |
| `libs/types/src/global-settings.ts`                                                | SchedulerSettings interface                                     |
| `libs/types/src/event.ts`                                                          | scheduler:task-failed EventType                                 |
