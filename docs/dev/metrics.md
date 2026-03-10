# Metrics

The metrics system captures DORA engineering metrics, agentic pipeline health, and error budget state. Data is collected via server-side events and persisted to `.automaker/metrics/`.

---

## DORA Metrics

DORA (DevOps Research and Assessment) metrics measure delivery performance across four dimensions.

| Metric                        | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| **Deployment Frequency**      | How often features are deployed (merged to main)       |
| **Change Lead Time**          | Time from feature start to merge                       |
| **Change Failure Rate (CFR)** | Ratio of deployments that cause post-merge CI failures |
| **Recovery Time**             | Time from CI failure detection to verified recovery    |

DORA metrics are collected by `MetricsCollectionService`, which subscribes to:

- `feature:pr-merged` — records deployment frequency and lead time
- `pr:ci-failure` — marks a change as failed (increments CFR)
- `pr:remediation-started` — records recovery start time

Persisted to: `.automaker/metrics/dora.json`

### API Endpoints

#### Current DORA Snapshot

```
GET /api/metrics/dora
```

Query parameters:

- `projectPath: string`
- `timeWindowDays?: number` — optional rolling window for aggregation

Returns the latest DORA snapshot for the project.

#### DORA History

```
GET /api/metrics/dora/history
```

Query parameters:

- `projectPath: string`
- `window: '7d' | '30d' | '90d'`

Returns time-bucketed DORA trends:

```json
{
  "buckets": [...DoraHistoryBucket[]],
  "window": "30d"
}
```

---

## Error Budget

The error budget tracks accumulated CFR against a configured threshold. It determines whether the pipeline is healthy enough to continue shipping new features at normal velocity.

### State

```typescript
interface ErrorBudgetState {
  totalMerges: number; // PRs merged in the rolling window
  failedMerges: number; // Merges where CI failed post-merge
  failRate: number; // failedMerges / totalMerges (0.0–1.0)
  exhausted: boolean; // failRate >= threshold
  windowDays: number; // Configured rolling window
  threshold: number; // Configured CFR threshold
}
```

### Events

| Event                    | Condition                                 | Effect                                                                 |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| `error_budget:exhausted` | `failRate >= 1.0` (budget fully consumed) | Auto-mode pauses new feature pickup (if `errorBudgetAutoFreeze: true`) |
| `error_budget:recovered` | `failRate < 0.8` (20% headroom restored)  | Auto-mode resumes feature pickup                                       |

Recovery uses an 0.8 hysteresis threshold to prevent rapid oscillation between frozen/unfrozen states.

### Configuration

Error budget behavior is controlled by `WorkflowSettings`:

```typescript
errorBudgetWindow?: number;       // Rolling window in days. Default: 7
errorBudgetThreshold?: number;    // CFR threshold 0.0–1.0. Default: 0.2
errorBudgetAutoFreeze?: boolean;  // Pause pickup on exhaustion. Default: true
```

See [Flow Control](./flow-control.md) for freeze lifecycle details.

### Persistence

Error budget state is stored at `.automaker/metrics/error-budget.json` and survives server restarts.

---

## Autonomy Rate

Autonomy rate measures how much of the pipeline's output is completed without human intervention.

```typescript
interface AgenticAutonomyRate {
  totalDone: number; // All features moved to 'done'
  autonomousDone: number; // Features completed without human escalation
  rate: number; // autonomousDone / totalDone (0.0–1.0)
}
```

A feature counts as `autonomousDone` when it reaches `done` status without requiring human review beyond the initial trust boundary evaluation (i.e., no manual unblocks, no escalation loops).

Persisted as part of agentic metrics at: `.automaker/metrics/agentic.json`

---

## WIP Saturation

WIP saturation tracks how full each pipeline lane is relative to its configured limit.

```typescript
interface AgenticWipSaturation {
  stage: 'execution' | 'review' | 'approval';
  currentWip: number;
  wipLimit: number | null; // null = no limit configured
  saturation: number | null; // currentWip / wipLimit, or null if no limit
}
```

Saturation per lane:

- `execution` — features in `in_progress` state vs. `maxInProgress`
- `review` — features in `review` state vs. `maxInReview`
- `approval` — features awaiting human approval

An `overLimit` flag is set when `currentWip > wipLimit`. The `overall` saturation is the maximum saturation across all lanes.

### Board Summary Endpoint

```
POST /api/features/summary
```

Body:

```json
{ "projectPath": "/path/to/project" }
```

Response includes:

```json
{
  "counts": { "backlog": 3, "in_progress": 2, "review": 1, "done": 47 },
  "wipSaturation": {
    "execution": { "count": 2, "limit": 5, "ratio": 0.4, "overLimit": false },
    "review": { "count": 1, "limit": 10, "ratio": 0.1, "overLimit": false },
    "overall": 0.4
  }
}
```

---

## Flow Metrics

Additional flow analysis endpoints are available for deeper pipeline inspection.

### Cumulative Flow Diagram

```
GET /api/metrics/flow
```

Query parameters:

- `projectPath: string`
- `days?: number` — lookback period (default: 90)
- `wipLimit?: number` — optional WIP limit overlay

Returns daily stage snapshots for a cumulative flow diagram.

### Stage Durations

```
GET /api/metrics/stage-durations
```

Query parameters:

- `projectPath: string`

Returns per-feature time spent in each stage (`backlog`, `in_progress`, `review`, `blocked`).

### Blocked Timeline

```
GET /api/metrics/blocked-timeline
```

Query parameters:

- `projectPath: string`

Returns blocked period analysis with reason categorization (dependency, CI failure, saturation, manual hold, etc.).

### Friction Analysis

```
GET /api/metrics/friction
```

Query parameters:

- `projectPath: string`

Returns recurring failure patterns across features — useful for identifying systemic blockers.

### Failure Breakdown

```
GET /api/metrics/failure-breakdown
```

Query parameters:

- `projectPath: string`

Returns a distribution of failure categories (build failures, test failures, lint errors, escalations, etc.).

---

## Agentic Metrics Snapshot

The `AgenticMetricsEntry` type captures a full point-in-time agentic pipeline snapshot:

```typescript
interface AgenticMetricsEntry {
  timestamp: string;
  autonomyRate: AgenticAutonomyRate;
  remediationLoops: AgenticRemediationRecord[];
  wipSaturation: AgenticWipSaturation[];
}
```

Snapshots are appended to `.automaker/metrics/agentic.json` on each significant pipeline event.

---

## Related Documentation

- [Flow Control](./flow-control.md) — WIP limits, error budget freeze, cost caps, and runtime timeouts
- [Workflow Settings](../server/workflow-settings.md) — full WorkflowSettings reference
- [Observability Package](./observability-package.md) — Langfuse tracing and cost tracking
