# Event Ledger

The Event Ledger is an append-only JSONL persistence layer that records lifecycle events across the system. It serves as a durable audit trail for feature and project state changes, enabling timeline queries, debugging, and retrospective analysis.

## Architecture

`EventLedgerService` writes discrete system events to `{DATA_DIR}/ledger/events.jsonl`. Each entry is a single JSON line with a unique ID, timestamp, event type, correlation IDs, payload, and source.

Writes are fire-and-forget: `append()` returns void immediately and never blocks the caller. Duplicate event IDs are silently skipped (idempotent).

## Storage format

```text
data/
└── ledger/
    └── events.jsonl    # Append-only JSONL — one EventLedgerEntry per line
```

Each line is a JSON-serialized `EventLedgerEntry`:

```typescript
interface EventLedgerEntry {
  id: string; // UUID — auto-generated if not provided
  timestamp: string; // ISO 8601
  eventType: string; // e.g. 'feature:status-changed'
  correlationIds: {
    featureId?: string;
    projectSlug?: string;
    milestoneSlug?: string;
  };
  payload: object; // Event-specific data
  source: string; // e.g. 'EventLedgerService'
}
```

## Subscribed event types

`EventLedgerService` subscribes to 13 lifecycle event types:

| Event type                             | Correlation IDs                |
| -------------------------------------- | ------------------------------ |
| `feature:status-changed`               | `featureId`                    |
| `feature:started`                      | `featureId`                    |
| `feature:completed`                    | `featureId`                    |
| `feature:error`                        | `featureId`                    |
| `feature:pr-merged`                    | `featureId`                    |
| `lead-engineer:feature-processed`      | `featureId`                    |
| `pipeline:state-entered`               | `featureId`                    |
| `milestone:completed`                  | `projectSlug`, `milestoneSlug` |
| `project:completed`                    | `projectSlug`                  |
| `project:lifecycle:launched`           | `projectSlug`                  |
| `ceremony:fired`                       | `projectSlug`, `milestoneSlug` |
| `escalation:signal-received`           | `featureId`                    |
| `auto-mode:event` (feature types only) | `featureId`                    |

Only feature-lifecycle sub-types of `auto-mode:event` are recorded (`feature_started`, `feature_completed`, `feature_error`, `feature_queued`, `feature_running`, `feature_retrying`). Progress and UI noise events are skipped.

## Query API

```typescript
// All events for a feature
await eventLedger.getByFeatureId(featureId);

// All events for a project slug
await eventLedger.getByProjectSlug(projectSlug);

// Events within a time window
await eventLedger.getByTimeRange(startDate, endDate);

// Events of a specific type
await eventLedger.getByEventType('feature:status-changed');

// Chronological events for a project, with optional filtering
await eventLedger.queryByProject(slug, { since: '2025-01-01T00:00:00Z', type: 'ceremony:fired' });
```

Each query reads the JSONL file and filters in a single pass.

## Timeline REST API

The event ledger is exposed via a REST endpoint on the projects router:

```text
GET /api/projects/:slug/timeline
```

Raw `EventLedgerEntry` records are transformed into display-ready `TimelineEvent` objects before returning. This mapping normalises event types (e.g. `feature:status-changed` with `to: 'done'` becomes `feature:done`) and extracts human-readable titles and descriptions from unstructured payloads.

**Query parameters:**

| Parameter     | Type     | Description                                                          |
| ------------- | -------- | -------------------------------------------------------------------- |
| `projectPath` | string   | Project root path — required for the feature-metadata fallback       |
| `since`       | ISO 8601 | Return only events after this timestamp (exclusive)                  |
| `type`        | string   | Filter by display event type (e.g. `feature:done`, `ceremony:fired`) |

**Response:**

```json
{
  "success": true,
  "events": [
    {
      "id": "...",
      "type": "feature:done",
      "title": "Completed: Add user authentication",
      "description": "PR #42",
      "occurredAt": "2025-03-01T10:00:00.000Z",
      "author": "auto-mode"
    }
  ]
}
```

Events are returned sorted newest-first.

### Feature-metadata fallback

When the ledger has no entries for the requested project (e.g. for projects that pre-date the ledger, or before enrichment begins), the endpoint automatically synthesises timeline events from feature metadata fields (`createdAt`, `startedAt`, `reviewStartedAt`, `completedAt`). This ensures the timeline is populated even before ledger enrichment starts.

The fallback requires `?projectPath=` to be present in the query. When the ledger does return entries, the fallback is skipped entirely.

### Display event types

| Display type           | Ledger source                                                  |
| ---------------------- | -------------------------------------------------------------- |
| `feature:created`      | Feature metadata fallback (`createdAt`)                        |
| `feature:started`      | `feature:started`, `feature:status-changed` (to started)       |
| `feature:done`         | `feature:completed`, `feature:status-changed` (to done)        |
| `pr:merged`            | `feature:pr-merged`, `feature:status-changed` (to review)      |
| `escalation`           | `feature:error`, `escalation:signal-received`                  |
| `decision`             | `pipeline:state-entered`                                       |
| `milestone:completed`  | `milestone:completed`                                          |
| `project:initiated`    | `project:lifecycle:initiated`                                  |
| `project:prd-approved` | `project:lifecycle:prd-approved`                               |
| `project:scaffolded`   | `project:scaffolded`                                           |
| `project:launched`     | `project:lifecycle:launched`                                   |
| `project:completed`    | `project:completed`                                            |
| `standup`              | `ceremony:fired` (ceremonyType: standup)                       |
| `retro`                | `ceremony:fired` (ceremonyType: milestone_retro/project_retro) |
| `ceremony:fired`       | `ceremony:fired` (other ceremony types)                        |

## Initialization

The service loads existing event IDs from disk on startup to populate the in-memory dedup set. Call `initialize()` once before use; subsequent calls are no-ops.

```typescript
const ledger = new EventLedgerService(dataDir, projectArtifactService);
await ledger.initialize();
const unsubscribe = ledger.subscribeToLifecycleEvents(eventEmitter);
```

## Escalation artifacts

When `escalation:signal-received` events contain project context (`projectPath` and `projectSlug`), the ledger additionally persists the escalation as a project artifact via `ProjectArtifactService` (type: `escalation`). This allows escalations to appear in the project artifacts view alongside ceremony reports.

## Key files

| File                                                 | Purpose                                               |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `apps/server/src/services/event-ledger-service.ts`   | EventLedgerService implementation                     |
| `apps/server/src/routes/projects/routes/timeline.ts` | `GET /api/projects/:slug/timeline`                    |
| `libs/types/src/event-ledger.ts`                     | `EventLedgerEntry`, `EventLedgerCorrelationIds` types |

## Related

- [Project Lifecycle](./project-lifecycle) — Project state machine and API endpoints
- [Project Artifacts](./project-lifecycle#project-artifacts) — Persisted project artifacts
- [Ceremonies](../agents/ceremonies) — Ceremony events recorded in the ledger
