# Flow Control

Flow control settings govern when the system pauses, slows down, or stops picking up new work. They protect pipeline health by enforcing cost budgets, runtime limits, WIP ceilings, and error budget freeze gates.

All settings are part of `WorkflowSettings` in `libs/types/src/workflow-settings.ts` and are read at runtime via the settings service.

---

## Cost Cap

```typescript
interface WorkflowSettings {
  /**
   * Maximum cost in USD allowed per feature execution.
   * When the feature's costUsd reaches or exceeds this value after agent
   * execution, the agent is killed and the feature is moved to `blocked`
   * with a statusChangeReason explaining the cap was hit.
   * A `cost:exceeded` event is emitted.
   * @default undefined (off — no cost cap enforced)
   */
  maxCostUsdPerFeature?: number;
}
```

### Behavior

- Checked **after each agent execution** against the accumulated `costUsd` on the feature record.
- When the cap is exceeded, the feature transitions to `blocked` with a `statusChangeReason` containing the cap value and actual cost.
- The `cost:exceeded` event is emitted on the server event bus for observability.
- When `undefined` (default), no per-feature cost limit is enforced.

> The pipeline-level `pipeline.maxAgentCostUsd` setting is a separate per-agent-run cost limit used by the supervisor. `maxCostUsdPerFeature` is a cumulative cap across all retries for a single feature.

---

## Runtime Timeout

```typescript
interface WorkflowSettings {
  /**
   * Maximum wall-clock runtime in minutes allowed per feature execution.
   * Measured from the feature's startedAt timestamp.
   * When elapsed minutes >= this value after agent execution, the feature
   * is moved to `blocked` with a statusChangeReason.
   * A `runtime:exceeded` event is emitted.
   * @default 60
   */
  maxRuntimeMinutesPerFeature?: number;
}
```

### Behavior

- Elapsed time is measured from `feature.startedAt` (set when the feature first enters `in_progress`).
- Checked **after each agent execution completes** — not as a hard interrupt mid-run.
- When the cap is exceeded, the feature transitions to `blocked` with a `statusChangeReason` explaining the timeout.
- The `runtime:exceeded` event is emitted for observability.
- Default is **60 minutes**. Set to `undefined` to disable.

---

## WIP Saturation

WIP (Work In Progress) limits define the maximum number of features allowed in each pipeline lane. When a lane is full, the scheduler will not start new work in that lane.

```typescript
interface WorkflowSettings {
  /**
   * Maximum features allowed in the `in_progress` state.
   * Used to compute wipSaturation metric on board summary.
   * @default 5
   */
  maxInProgress?: number;

  /**
   * Maximum features allowed in the `review` state.
   * Used to compute wipSaturation metric on board summary.
   * @default 10
   */
  maxInReview?: number;

  /**
   * Maximum PRs waiting for human review before auto-mode pauses pickup.
   * When review count >= this threshold, pickup pauses until the queue drains.
   * @default 5
   */
  maxPendingReviews?: number;
}
```

### Saturation Calculation

WIP saturation is computed per lane as a ratio:

```
saturation = currentCount / limit
```

The board summary endpoint (`POST /api/features/summary`) returns per-lane saturation alongside an `overLimit` boolean and an `overall` saturation value (the max of all lane ratios).

### Review Queue Gate

`maxPendingReviews` is enforced by the execution gate: when the number of features in `review` state reaches this threshold, the scheduler will not pick up new features until the queue drops below the limit.

---

## Error Budget Freeze

The error budget freeze is an automatic circuit breaker that pauses new feature pickup when the Change Failure Rate (CFR) exceeds a configured threshold.

```typescript
interface WorkflowSettings {
  /**
   * Rolling window (in days) for CFR computation. Default: 7
   */
  errorBudgetWindow?: number;

  /**
   * CFR threshold (0.0–1.0) above which the budget is considered exhausted.
   * Example: 0.2 = 20% of merged PRs failed CI post-merge.
   * Default: 0.2
   */
  errorBudgetThreshold?: number;

  /**
   * When true, auto-mode pauses new feature pickup when the error budget is
   * exhausted. Pickup resumes automatically when the budget recovers.
   * Running agents are NOT affected — only new feature starts are blocked.
   * Default: true
   */
  errorBudgetAutoFreeze?: boolean;
}
```

### Freeze Lifecycle

1. **Tracking**: `ErrorBudgetService` records every PR merge and whether CI failed post-merge.
2. **Exhaustion**: When `failRate >= 1.0` (budget fully consumed), `error_budget:exhausted` is emitted.
3. **Freeze**: `AutoModeCoordinator` listens for `error_budget:exhausted`. If `errorBudgetAutoFreeze` is `true` (default), it sets an internal `_pickupFrozen` flag.
4. **Gate**: The `FeatureScheduler` calls `coordinator.isPickupFrozen()` before starting any new feature. Frozen → skip pickup.
5. **Recovery**: When `failRate` drops below `0.8` (20% headroom), `error_budget:recovered` is emitted. The coordinator clears the flag and pickup resumes.

**Running agents are never interrupted by a freeze.** Only new feature starts are blocked.

### Disabling the Freeze

Set `errorBudgetAutoFreeze: false` to allow auto-mode to continue pickup regardless of error budget state. Metrics and events are still recorded — the freeze gate is simply bypassed.

### Persistence

The error budget state is persisted to `.automaker/metrics/error-budget.json`. This survives server restarts.

---

## Execution Gate Summary

The execution gate (`executionGate` setting, default: `true`) bundles all flow control checks into a single pre-pickup guard:

| Check                  | Setting                                          | Behavior on failure       |
| ---------------------- | ------------------------------------------------ | ------------------------- |
| Review queue depth     | `maxPendingReviews`                              | Return feature to backlog |
| Error budget exhausted | `errorBudgetThreshold` + `errorBudgetAutoFreeze` | Block new starts          |
| CI saturation          | `maxPendingCiRuns` (default: 10)                 | Return feature to backlog |

```typescript
interface WorkflowSettings {
  /**
   * Enable execution gate checks before launching the agent in EXECUTE state.
   * @default true
   */
  executionGate?: boolean;

  /**
   * Max pending GitHub check runs before CI is considered saturated.
   * @default 10
   */
  maxPendingCiRuns?: number;
}
```

---

## API Endpoints

### Get Workflow Settings

```
GET /api/settings/workflow
```

Query parameters:

- `projectPath: string` — path to the project root

Response:

```json
{
  "success": true,
  "workflow": { ...WorkflowSettings }
}
```

### Update Workflow Settings

```
PUT /api/settings/workflow
```

Body:

```json
{
  "projectPath": "/path/to/project",
  "workflow": {
    "maxCostUsdPerFeature": 5,
    "maxRuntimeMinutesPerFeature": 30,
    "maxInProgress": 3,
    "errorBudgetThreshold": 0.1,
    "errorBudgetAutoFreeze": true
  }
}
```

Accepts partial `WorkflowSettings`. The response includes the full merged settings after the update. Emits a `settings:workflow-changed` event on the server event bus.

Response:

```json
{
  "success": true,
  "workflow": { ...WorkflowSettings }
}
```

---

## Related Documentation

- [Workflow Settings](../server/workflow-settings.md) — full WorkflowSettings reference
- [Metrics](./metrics.md) — error budget state, autonomy rate, and WIP saturation metrics
- [Lead Engineer Pipeline](./lead-engineer-pipeline.md) — how processors read these settings
