# DORA Metrics

Team health monitoring via feature-based proxy metrics for lead time, deployment frequency, change failure rate, recovery time, and rework rate.

## Overview

The DORA metrics endpoint computes the four key DORA metrics (plus rework rate) from feature status history — no CI/CD pipeline integration required. Feature state transitions serve as proxies:

| DORA Metric          | Proxy source                                            |
| -------------------- | ------------------------------------------------------- |
| Lead time            | `completedAt - createdAt` for `done` features           |
| Deployment frequency | `done` features per day over the time window            |
| Change failure rate  | Features that transitioned `done → blocked` (rollbacks) |
| Recovery time        | Time spent in `blocked` status per feature              |
| Rework rate          | Features with `failureCount > 0`                        |

## API Reference

### GET /api/dora/metrics

Compute DORA metrics for a project over a configurable time window.

**Query parameters:**

| Param            | Type    | Required | Default | Description                               |
| ---------------- | ------- | -------- | ------- | ----------------------------------------- |
| `projectPath`    | string  | ✓        | —       | Absolute path to the project root         |
| `timeWindowDays` | integer | ✗        | `30`    | Number of days to look back (must be ≥ 1) |

**Example request:**

```
GET /api/dora/metrics?projectPath=/home/user/myproject&timeWindowDays=14
```

**Response:**

```json
{
  "success": true,
  "metrics": {
    "leadTime": {
      "value": 36.5,
      "unit": "hours",
      "threshold": { "warning": 48, "critical": 96 }
    },
    "deploymentFrequency": {
      "value": 0.714,
      "unit": "per_day",
      "threshold": { "warning": 0.5, "critical": 0.1 }
    },
    "changeFailureRate": {
      "value": 0.05,
      "unit": "ratio",
      "threshold": { "warning": 0.2, "critical": 0.4 }
    },
    "recoveryTime": {
      "value": 2.3,
      "unit": "hours",
      "threshold": { "warning": 1.0, "critical": 4.0 }
    },
    "reworkRate": {
      "value": 0.1,
      "unit": "ratio",
      "threshold": { "warning": 0.3, "critical": 0.5 }
    },
    "computedAt": "2026-03-08T12:00:00.000Z",
    "timeWindowDays": 14
  },
  "alerts": [
    {
      "metric": "recoveryTime",
      "severity": "warning",
      "message": "recoveryTime is at 2.300 (warning threshold: 1)",
      "currentValue": 2.3,
      "thresholdValue": 1.0
    }
  ]
}
```

**Errors:**

| Status | Cause                                                                |
| ------ | -------------------------------------------------------------------- |
| 400    | `projectPath` missing, or `timeWindowDays` is not a positive integer |
| 500    | Feature loader error                                                 |

## Metrics Reference

### Lead Time

Average time from feature creation to completion (status `done`).

- **Unit:** hours
- **Direction:** lower is better
- **Thresholds:** warning ≥ 48h, critical ≥ 96h
- **Only features with both `createdAt` and `completedAt` are included**

### Deployment Frequency

Number of features completed per day over the time window.

- **Unit:** per_day
- **Direction:** higher is better
- **Thresholds:** warning ≤ 0.5/day, critical ≤ 0.1/day

### Change Failure Rate

Fraction of completed features that were subsequently blocked (rolled back).

- **Unit:** ratio (0.0 – 1.0)
- **Direction:** lower is better
- **Thresholds:** warning ≥ 0.2, critical ≥ 0.4
- **Detection:** features in `blocked` status with a `statusHistory` entry `from: 'done'` or `from: 'review'`

### Recovery Time

Average time features spend in `blocked` status before being unblocked.

- **Unit:** hours
- **Direction:** lower is better
- **Thresholds:** warning ≥ 1h, critical ≥ 4h
- **Computed from `statusHistory` transitions:** `→ blocked` records start time, `blocked →` records end time

### Rework Rate

Fraction of features with `failureCount > 0` (agent re-runs or manual corrections).

- **Unit:** ratio (0.0 – 1.0)
- **Direction:** lower is better
- **Thresholds:** warning ≥ 0.3, critical ≥ 0.5

## Alert Semantics

`evaluateRegulation()` returns an array of `DoraRegulationAlert` objects. Each alert has:

```typescript
interface DoraRegulationAlert {
  metric: 'leadTime' | 'deploymentFrequency' | 'changeFailureRate' | 'recoveryTime' | 'reworkRate';
  severity: 'warning' | 'critical';
  message: string; // human-readable description with current and threshold values
  currentValue: number;
  thresholdValue: number; // the threshold that was breached
}
```

`deploymentFrequency` is only alerted on when `leadTime.value > 0` (i.e., at least one completed feature exists in the window). An empty project returns no alerts.

## Default Thresholds

| Metric                | Warning  | Critical | Direction     |
| --------------------- | -------- | -------- | ------------- |
| `changeFailureRate`   | 0.2      | 0.4      | higher is bad |
| `reworkRate`          | 0.3      | 0.5      | higher is bad |
| `recoveryTime`        | 1h       | 4h       | higher is bad |
| `leadTime`            | 48h      | 96h      | higher is bad |
| `deploymentFrequency` | ≤0.5/day | ≤0.1/day | lower is bad  |

Thresholds are configurable at service construction time via `DoraMetricsService(featureLoader, thresholds?)`.

## Operational Intelligence Endpoints

Two additional endpoints expose operational signals tracked by the server.

### GET /api/metrics/friction

Returns all active recurring failure patterns tracked by `FrictionTrackerService`, sorted descending by occurrence count. Patterns expire after their rolling window; expired patterns are excluded.

**Query parameters:** none

**Example response:**

```json
{
  "success": true,
  "patterns": [
    {
      "pattern": "TypeScript compilation error",
      "count": 5,
      "lastSeen": "2026-03-09T10:00:00.000Z"
    },
    { "pattern": "Test timeout in CI", "count": 2, "lastSeen": "2026-03-09T08:30:00.000Z" }
  ],
  "total": 2
}
```

### GET /api/metrics/failure-breakdown

Aggregates `failureClassification.category` across all features in a project. Only features with a persisted `failureClassification` (written by the `EscalateProcessor`) are counted.

**Query parameters:**

| Param         | Type   | Required | Description                       |
| ------------- | ------ | -------- | --------------------------------- |
| `projectPath` | string | ✓        | Absolute path to the project root |

**Example response:**

```json
{
  "success": true,
  "categories": [
    { "category": "test_failure", "count": 8 },
    { "category": "transient", "count": 3 },
    { "category": "unknown", "count": 1 }
  ],
  "total": 12
}
```

**Errors:**

| Status | Cause                 |
| ------ | --------------------- |
| 400    | `projectPath` missing |
| 500    | Feature loader error  |

## Key Files

| File                                                   | Role                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `apps/server/src/routes/metrics/dora.ts`               | HTTP routes — friction, failure-breakdown, dora history |
| `apps/server/src/routes/metrics/index.ts`              | Metrics router — mounts all metrics sub-routes          |
| `apps/server/src/services/dora-metrics-service.ts`     | Metric computation and threshold evaluation             |
| `apps/server/src/services/friction-tracker-service.ts` | In-memory friction pattern counter with rolling window  |
| `libs/types/src/dora-metrics.ts`                       | `DoraMetrics`, `DoraRegulationAlert` types              |

## Limitations

DORA metrics here are **feature-based proxies**, not pipeline measurements:

- **Lead time** measures feature lifecycle, not CI/CD pipeline duration
- **Deployment frequency** counts features shipped, not production deployments
- **Change failure rate** detects rollbacks via status history, not deployment failures
- **Recovery time** measures board-level blocking, not infrastructure incident duration

These are suitable for **team health monitoring and trend detection**, not compliance reporting or SLO measurement.

## Event-Driven Metrics Collection

The `MetricsCollectionService` and `AgenticMetricsService` automatically collect metrics from the event bus — no manual API calls required.

### MetricsCollectionService

Subscribes to deployment lifecycle events and updates the DORA time-series persisted to `.automaker/metrics/dora.json`.

| Event                    | DORA Impact                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `feature:pr-merged`      | Records deployment; updates deployment frequency and change lead time |
| `pr:ci-failure`          | Increments change failure count                                       |
| `pr:remediation-started` | Records recovery start timestamp                                      |

Each snapshot is a `DoraTimeSeriesEntry`:

```typescript
interface DoraTimeSeriesEntry {
  timestamp: string; // ISO-8601
  deploymentFrequency: number; // deployments per day (7-day window)
  changeLeadTime: number; // average hours from PR open to merge
  changeFailRate: number; // ratio of failed deployments (7-day window)
  recoveryTime: number; // average hours to remediate
}
```

Entries are appended to `DoraTimeSeriesDocument` and persisted atomically (via `atomicWriteJson`).

### AgenticMetricsService

Tracks AI-specific health signals and persists to `.automaker/metrics/agentic.json`.

| Event                    | Agentic Impact                                  |
| ------------------------ | ----------------------------------------------- |
| `feature:status-changed` | Updates WIP stage saturation                    |
| `agent:completed`        | Records autonomy success/failure, cost data     |
| `pr:merged`              | Counts autonomous completions for autonomy rate |
| `pr:review-requested`    | Records remediation loop if it's a re-review    |

#### Autonomy Rate

```typescript
interface AgenticAutonomyRate {
  windowDays: number; // Rolling window
  autonomousCount: number; // Features completed without human intervention
  totalCount: number;
  rate: number; // autonomousCount / totalCount
}
```

#### Remediation Records

```typescript
interface AgenticRemediationRecord {
  featureId: string;
  prIterations: number; // Number of PR review cycles
  resolvedAt?: string;
}
```

#### WIP Saturation

```typescript
interface AgenticWipSaturation {
  execution: number; // Features currently in agent execution
  review: number; // Features awaiting PR review
  approval: number; // Features awaiting human approval
}
```

Snapshots are recorded as `AgenticMetricsEntry` objects appended to `AgenticMetricsDocument`.

---

## Metrics Ledger

For per-feature analytics (cost, cycle time, execution count), see the **metrics ledger** persisted to `.automaker/ledger/metrics.jsonl`.

Each `MetricsLedgerRecord` captures:

```typescript
interface MetricsLedgerRecord {
  recordId: string;
  featureId: string;
  epicId?: string;
  projectSlug: string;
  complexity: PRDComplexity;
  entryType: 'completed' | 'escalated' | 'abandoned';

  // Lifecycle timestamps
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  // Cost tracking
  totalCostUsd: number;
  costByModel: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;

  // Quality signals
  executionCount: number; // How many times the agent ran
  failureCount: number; // Agent failures before success
  escalated: boolean;

  // Per-run details
  executions: LedgerExecution[];
}
```

The ledger is append-only JSONL, safe for concurrent writes via `atomicWriteJson`.

---

## See Also

- [Route Organization](./route-organization.md) — Express route registration patterns
- [Knowledge Store](./knowledge-store.md) — SQLite FTS5 for feature retrieval
- [Workflow Settings](./workflow-settings.md) — Error budget window and threshold configuration
