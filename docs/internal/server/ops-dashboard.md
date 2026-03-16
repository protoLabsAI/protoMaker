# Ops Dashboard Reference

This page is a complete reference for the Ops Dashboard: its URL, tabs, API endpoints, and WebSocket events. Use it to look up specific details about what the dashboard shows and how to query its data programmatically.

## Access

The Ops Dashboard is available in the UI sidebar under the system monitoring section. It aggregates data from the scheduler, maintenance system, event history, and system health endpoints.

## Tabs

The dashboard is organized into four tabs. Each tab pulls data from one or more API endpoints.

### Timers Tab

Displays all registered scheduler tasks with their current state.

**Data source:** `GET /api/automations/scheduler/status`

**Columns:**

| Column     | Description                                        |
| ---------- | -------------------------------------------------- |
| Name       | Human-readable task name                           |
| ID         | Unique task identifier                             |
| Schedule   | Cron expression                                    |
| Status     | Enabled or disabled                                |
| Last Run   | Timestamp of most recent execution                 |
| Next Run   | Timestamp of next scheduled execution              |
| Executions | Total number of times the task has run             |
| Failures   | Consecutive failure count (resets on success)      |
| Last Error | Error message from the most recent failure, if any |

**Actions per timer:**

- **Enable/Disable** -- Toggles the task's enabled state via `PUT /api/automations/:id`
- **Run Now** -- Triggers immediate execution via `POST /api/automations/:id/run`
- **Edit Schedule** -- Changes the cron expression via `PUT /api/automations/:id`

### Events Tab

Shows recent event deliveries from the `EventHistoryService`.

**Data source:** `POST /api/event-history/list`

**Request body:**

```json
{
  "projectPath": "/path/to/project",
  "limit": 50,
  "offset": 0,
  "filter": {
    "trigger": "feature:status-changed",
    "severity": "warning"
  }
}
```

**Columns:**

| Column    | Description                                                  |
| --------- | ------------------------------------------------------------ |
| Timestamp | When the event occurred                                      |
| Trigger   | Event type (e.g., `feature:status-changed`, `pr:ci-failure`) |
| Severity  | `info`, `warning`, or `critical`                             |
| Feature   | Associated feature ID, if any                                |
| Summary   | One-line description of the event                            |

**Actions:**

- **Filter by trigger** -- Dropdown to select a specific event type
- **Filter by severity** -- Dropdown to select severity level
- **Replay** -- Re-emit the event for testing hook configurations

### Maintenance Tab

Shows results from the most recent maintenance sweeps.

**Data source:** WebSocket events of type `maintenance:check-completed` and `maintenance:check-failed`

**Sections:**

**Critical Sweep (every 5 minutes):**

| Column        | Description                               |
| ------------- | ----------------------------------------- |
| Check         | Name of the maintenance check             |
| Issues Found  | Number of issues detected in the last run |
| Fixes Applied | Number of auto-remediations performed     |
| Duration      | How long the check took in milliseconds   |
| Status        | Success or failure                        |

**Full Sweep (every 6 hours):**

Same columns as the critical sweep, showing the full tier checks.

**Aggregate stats:**

- Total issues found (all time)
- Total fixes applied (all time)
- Last critical sweep timestamp
- Last full sweep timestamp

### System Tab

Shows server resource usage and runtime health.

**Data source:** `POST /api/system/health-dashboard`

**Panels:**

| Panel         | Description                                               |
| ------------- | --------------------------------------------------------- |
| Memory        | RSS, heap used/total, system used/total, usage percentage |
| CPU           | Load average (1 min), core count, load percentage         |
| Heap          | V8 heap used/limit with percentage gauge                  |
| Agents        | Currently running agent count and feature IDs             |
| Auto-mode     | Running state, concurrent feature count                   |
| Lead Engineer | Active session count with project paths                   |
| Uptime        | Server process uptime in seconds                          |

## API Reference

### Scheduler Status

```
GET /api/automations/scheduler/status
```

Returns the scheduler's overall state and all registered tasks.

**Response:**

```json
{
  "running": true,
  "taskCount": 8,
  "enabledTaskCount": 7,
  "tasks": [
    {
      "id": "maintenance-critical",
      "name": "Critical Maintenance Sweep",
      "cronExpression": "*/5 * * * *",
      "enabled": true,
      "lastRun": "2026-03-15T10:05:00.000Z",
      "nextRun": "2026-03-15T10:10:00.000Z",
      "failureCount": 0,
      "executionCount": 42
    }
  ]
}
```

### Automation List

```
GET /api/automations/list
```

Returns all registered automations (including maintenance flows).

### Trigger Automation

```
POST /api/automations/:id/run
```

Manually triggers an automation by ID. Returns the execution result.

**Response:**

```json
{
  "taskId": "maintenance-critical",
  "success": true,
  "executedAt": "2026-03-15T10:15:00.000Z",
  "duration": 245
}
```

### System Health

```
POST /api/system/health-dashboard
```

Returns comprehensive system health data for the dashboard gauges.

### Event History

```
POST /api/event-history/list
```

Lists stored events with optional filtering. See the Events Tab section for request format.

## WebSocket Events

The dashboard subscribes to the server's WebSocket for real-time updates. The following event types are relevant:

| Event Type                    | Payload                                            | Tab         |
| ----------------------------- | -------------------------------------------------- | ----------- |
| `scheduler:task_started`      | `{ taskId, name, executedAt }`                     | Timers      |
| `scheduler:task_completed`    | `{ taskId, name, success, duration, nextRun }`     | Timers      |
| `scheduler:task-failed`       | `{ taskId, taskName, error, timestamp }`           | Timers      |
| `scheduler:task_enabled`      | `{ taskId, name, nextRun }`                        | Timers      |
| `scheduler:task_disabled`     | `{ taskId, name }`                                 | Timers      |
| `maintenance:check-completed` | `{ check, issuesFound, fixesApplied, durationMs }` | Maintenance |
| `maintenance:check-failed`    | `{ check, error, durationMs }`                     | Maintenance |
| `feature:status-changed`      | `{ featureId, from, to, timestamp }`               | Events      |

The UI subscribes to all events and filters client-side. No separate subscription mechanism is needed.

## Key Files

| File                                                | Role                                 |
| --------------------------------------------------- | ------------------------------------ |
| `apps/server/src/routes/dashboard.ts`               | System health endpoint               |
| `apps/server/src/routes/automations/index.ts`       | Automation CRUD and scheduler status |
| `apps/server/src/routes/event-history/`             | Event history list and replay        |
| `apps/server/src/services/scheduler-service.ts`     | Timer registry                       |
| `apps/server/src/services/automation-service.ts`    | Automation management                |
| `apps/server/src/services/event-history-service.ts` | Event persistence                    |

## See Also

- **[Ops Control Plane](./ops-control-plane.md)** -- Architecture explanation of the unified ops layer
- **[Timer Registry](./timer-registry.md)** -- How to add new timers
- **[Maintenance Checks](./maintenance-checks.md)** -- How to create new check modules
- **[DORA Metrics](./dora-metrics.md)** -- Team health monitoring via feature-based proxy metrics
