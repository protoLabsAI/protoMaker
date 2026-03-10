# Workflow Settings

Workflow settings control the behavior of the entire feature execution pipeline—from how PRDs are classified and approved, to how agents retry on failure, to what checks run before and after execution.

Settings are stored per-project and loaded at runtime. The defaults are defined in `libs/types/src/workflow-settings.ts`.

---

## PRD Classification

### Complexity

```typescript
type PRDComplexity = 'small' | 'medium' | 'large' | 'architectural';
```

Complexity determines:

- Whether the PLAN phase runs (large/architectural, or ≥3 files → always plans)
- Which LLM model is selected (small → haiku, others → sonnet, architectural → opus)
- Whether an antagonistic review gate applies

### Category

```typescript
type PRDCategory = 'ops' | 'improvement' | 'bug' | 'feature' | 'idea' | 'architectural';
```

Category is used by trust boundary rules to decide if a PRD auto-approves or requires human review.

---

## Trust Boundary Configuration

The trust boundary controls automatic vs. human-reviewed approval of incoming PRDs.

```typescript
interface TrustBoundaryConfig {
  autoApprove: AutoApproveRule[];
  requireReview: RequireReviewRule[];
}
```

### Auto-Approve Rules (AND logic)

All conditions in a rule must match for auto-approval:

```typescript
interface AutoApproveRule {
  complexity?: PRDComplexity[]; // e.g. ['small']
  category?: PRDCategory[]; // e.g. ['ops', 'bug', 'improvement']
}
```

**Default**: Auto-approve when complexity is `small` AND category is `ops`, `improvement`, or `bug`.

### Require-Review Rules (OR logic)

Any matching condition triggers a review requirement:

```typescript
interface RequireReviewRule {
  complexity?: PRDComplexity[];
  category?: PRDCategory[];
}
```

**Default**: Require review if category is `idea` or `architectural`, OR if complexity is `large` or `architectural`.

> Note: `requireReview` takes precedence over `autoApprove` when both match.

---

## Pipeline Settings

Controls the core feature execution pipeline behavior.

```typescript
interface WorkflowSettings {
  pipeline: {
    goalGatesEnabled: boolean; // Enable goal gate checks. Default: true
    checkpointEnabled: boolean; // Enable LangGraph checkpointing. Default: true
    loopDetectionEnabled: boolean; // Detect and break infinite agent loops. Default: true
    supervisorEnabled: boolean; // Enable supervisor oversight. Default: true
    maxAgentRuntimeMinutes: number; // Timeout per agent run. Default: 45
    maxAgentCostUsd: number; // Max cost per feature in USD. Default: 15
    antagonisticPlanReview: boolean; // Run antagonistic review for large/arch plans. Default: true
    maxAgentRetries: number; // Agent re-run retry budget. Default: 3
    maxInfraRetries: number; // Transient infra retry budget. Default: 3
  };
}
```

### `maxAgentRetries`

How many times the agent can be re-launched when it fails. Each re-launch consumes one retry. Escalation occurs when budget is exhausted.

Transient infrastructure failures (lock files, push conflicts) use a separate `maxInfraRetries` counter and do **not** consume agent retries.

### `maxAgentCostUsd`

Hard cap on spend per feature. Execution is blocked when this threshold is reached. The budget is checked:

- Before launching the agent
- After each agent completion

### `antagonisticPlanReview`

When `true`, plans for `large` and `architectural` features are submitted to the `AntagonisticReviewService` before the agent starts executing. Set to `false` to skip this gate for all features in the project.

---

## Pre-Flight Checks

```typescript
interface WorkflowSettings {
  preFlightChecks: {
    enabled: boolean; // Default: true
  };
}
```

When enabled, the EXECUTE processor runs three checks before launching the agent:

1. **Worktree currency** — syncs worktree with `git fetch` + `git rebase origin/dev`
2. **Package builds** — validates required packages compile successfully
3. **Dependency merge** — verifies all blocking upstream features are merged

---

## Retro Settings

```typescript
interface WorkflowSettings {
  retro: {
    enabled: boolean; // Generate retros automatically. Default: true
    triggerOnFeatureDone: boolean; // Trigger retro after each feature. Default: true
  };
}
```

---

## Cleanup Settings

```typescript
interface WorkflowSettings {
  cleanup: {
    enabled: boolean; // Auto-cleanup stale worktrees. Default: true
    staleWorktreeHours: number; // Hours before a worktree is considered stale. Default: 4
  };
}
```

---

## Signal Intake

```typescript
interface WorkflowSettings {
  signalIntake: {
    defaultCategory: PRDCategory; // Category assigned to uncategorized signals. Default: 'feature'
    autoResearch: boolean; // Auto-research incoming signals. Default: true
    autoApprove: boolean; // Apply trust boundary auto-approve logic. Default: true
  };
}
```

---

## Bug Tracking

```typescript
interface WorkflowSettings {
  bugs: {
    enabled: boolean; // Enable bug tracking. Default: true
    createGitHubIssue: boolean; // Mirror bugs as GitHub issues. Default: false
  };
}
```

---

## Post-Merge Verification

```typescript
interface WorkflowSettings {
  postMergeVerification: {
    enabled: boolean; // Run typecheck + build after merge. Default: true
    runTypecheck: boolean; // Default: true
    runBuild: boolean; // Default: true
  };
}
```

---

## Queue Saturation and Error Budget

### Review Queue Limit

```typescript
interface WorkflowSettings {
  maxPendingReviews: number; // Pause feature pickup when queue is full. Default: 5
}
```

When the number of features awaiting human review reaches `maxPendingReviews`, the system pauses automatic feature pickup to prevent unbounded queue growth.

### Error Budget

```typescript
interface WorkflowSettings {
  errorBudgetWindow: number; // Rolling window in days. Default: 7
  errorBudgetThreshold: number; // CFR threshold (0.0–1.0). Default: 0.2
}
```

The error budget tracks the Change Failure Rate (CFR) over a rolling window. When CFR exceeds the threshold, the system can pause new work or trigger alerts.

- `errorBudgetWindow: 7` → calculate CFR over the last 7 days
- `errorBudgetThreshold: 0.2` → alert/pause when 20%+ of changes cause failures

---

## Default Settings

```typescript
export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  pipeline: {
    goalGatesEnabled: true,
    checkpointEnabled: true,
    loopDetectionEnabled: true,
    supervisorEnabled: true,
    maxAgentRuntimeMinutes: 45,
    maxAgentCostUsd: 15,
    antagonisticPlanReview: true,
    maxAgentRetries: 3,
    maxInfraRetries: 3,
  },
  retro: { enabled: true, triggerOnFeatureDone: true },
  cleanup: { enabled: true, staleWorktreeHours: 4 },
  signalIntake: {
    defaultCategory: 'feature',
    autoResearch: true,
    autoApprove: true,
  },
  bugs: { enabled: true, createGitHubIssue: false },
  postMergeVerification: { enabled: true, runTypecheck: true, runBuild: true },
  preFlightChecks: { enabled: true },
  maxPendingReviews: 5,
  errorBudgetWindow: 7,
  errorBudgetThreshold: 0.2,
};
```

---

## Related Documentation

- [Lead Engineer Pipeline](../dev/lead-engineer-pipeline.md) — how processors use these settings
- [DORA Metrics](./dora-metrics.md) — error budget and CFR tracking
- [Antagonistic Review](../protolabs/antagonistic-review.md) — the plan review gate
