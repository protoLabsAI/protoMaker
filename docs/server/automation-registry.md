# Automation Registry

The Automation Registry provides a REST API and service layer for defining, scheduling, and manually triggering automation flows. Automations reference named flows in a FlowRegistry and can run on cron schedules or on demand.

## Architecture

```
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

**FlowRegistry**: A process-scoped `Map<string, FlowFactory>` (singleton). Services register flows at startup using `flowRegistry.register(flowId, factory)`. The factory receives the automation's `modelConfig` at execution time.

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

Returns all automations.

```json
{
  "automations": [
    {
      "id": "uuid",
      "name": "Nightly Cleanup",
      "flowId": "cleanup-flow",
      "trigger": { "type": "cron", "expression": "0 3 * * *" },
      "enabled": true,
      "modelConfig": { "model": "haiku" },
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST /create

Creates a new automation. The automation is immediately registered with the scheduler if it has a cron trigger and `enabled: true`.

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
| `event`   | `eventType` (string)               | Stored only; event routing not yet wired   |
| `webhook` | `path` (string)                    | Stored only; webhook routing not yet wired |

Returns `201` with the created automation object.

### PUT /:id

Updates any field on an automation. Scheduler registration is synced automatically:

- Enabling a cron automation registers it with the scheduler
- Disabling a cron automation calls `disableTask()` on the scheduler
- Changing the cron expression calls `updateTaskSchedule()` on the scheduler
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
      "automationId": "automation-uuid",
      "status": "success",
      "startedAt": "2026-01-01T03:00:00.000Z",
      "completedAt": "2026-01-01T03:00:01.234Z",
      "error": null
    }
  ]
}
```

Run status values: `running`, `success`, `failure`.

### POST /:id/run

Manually triggers the automation, bypassing the cron schedule. The flow referenced by `flowId` must be registered in the FlowRegistry. Returns the run record.

```json
{
  "id": "run-uuid",
  "automationId": "automation-uuid",
  "status": "success",
  "startedAt": "...",
  "completedAt": "...",
  "error": null
}
```

## Registering Flows

Flows must be registered in the FlowRegistry before automations can execute them. Register flows at server startup:

```typescript
import { flowRegistry } from '../services/automation-service.js';

flowRegistry.register('my-flow', async (modelConfig) => {
  const model = (modelConfig?.model as string) ?? 'sonnet';
  // ... run the flow
});
```

## Startup Integration

`scheduler.module.ts` calls `automationService.syncWithScheduler(deps)` after the scheduler starts. This method:

1. Registers all built-in maintenance tasks (same as before)
2. Loads all stored automations from disk
3. Registers enabled cron automations with the scheduler

## Data Storage

| File                              | Contents                                     |
| --------------------------------- | -------------------------------------------- |
| `{DATA_DIR}/automations.json`     | Array of automation definitions              |
| `{DATA_DIR}/automation-runs.json` | Array of run records (capped per automation) |

`DATA_DIR` defaults to `./data`. See [Environment Variables](/getting-started/env-vars.md).
