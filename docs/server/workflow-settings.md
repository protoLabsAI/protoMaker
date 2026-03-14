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
  /** Whether trust boundary evaluation is enabled (default: true) */
  enabled: boolean;
  /** Auto-approval rules (all conditions must match) */
  autoApprove: AutoApproveRule;
  /** Review requirement rules (any condition triggers review) */
  requireReview: RequireReviewRule;
  /** Risk auto-approve threshold (work items with risk <= this level skip approval) */
  riskAutoApproveThreshold?: RiskLevel;
}
```

### Auto-Approve Rule (AND logic)

All conditions must match for auto-approval:

```typescript
interface AutoApproveRule {
  /** Maximum complexity level that can be auto-approved (default: 'small') */
  maxComplexity?: PRDComplexity;
  /** Categories eligible for auto-approval (default: ['ops', 'improvement', 'bug']) */
  categories?: PRDCategory[];
  /** Maximum estimated cost in dollars (default: undefined = no limit) */
  maxEstimatedCost?: number;
}
```

**Default**: Auto-approve when complexity is `small` AND category is `ops`, `improvement`, or `bug`.

### Require-Review Rule (OR logic)

Any matching condition triggers a review requirement:

```typescript
interface RequireReviewRule {
  /** Categories that always require review (default: ['idea', 'architectural']) */
  categories?: PRDCategory[];
  /** Minimum complexity level that requires review (default: 'large') */
  minComplexity?: PRDComplexity;
  /** Minimum estimated cost that requires review (default: undefined = no limit) */
  minEstimatedCost?: number;
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
    antagonisticPlanReview?: boolean; // Run antagonistic review for large/arch plans. Default: true
    maxAgentRetries?: number; // Agent re-run retry budget. Default: 3
    maxInfraRetries?: number; // Transient infra retry budget. Default: 3
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
  preFlightChecks?: boolean; // Default: true
}
```

When enabled (`true`), the EXECUTE processor runs three checks before launching the agent:

1. **Worktree currency** — syncs worktree with `git fetch` + `git rebase origin/dev`
2. **Package builds** — validates required packages compile successfully
3. **Dependency merge** — verifies all blocking upstream features are merged

Pre-flight failures are classified as infrastructure failures and do **not** count against the feature's agent retry budget.

---

## Retro Settings

```typescript
interface WorkflowSettings {
  retro: {
    enabled: boolean; // Generate retros automatically. Default: true
  };
}
```

---

## Cleanup Settings

```typescript
interface WorkflowSettings {
  cleanup: {
    autoCleanupEnabled: boolean; // Auto-cleanup stale worktrees/features. Default: true
    staleThresholdHours: number; // Hours before orphaned in-progress features are reset. Default: 4
  };
}
```

---

## Signal Intake

```typescript
interface WorkflowSettings {
  signalIntake: {
    defaultCategory: 'ops' | 'gtm'; // Category for unclassified signals. Default: 'ops'
    autoResearch: boolean; // Auto-trigger research on new signals. Default: false
    autoApprovePRD: boolean; // Auto-approve PRDs without user review. Default: false
  };
}
```

---

## Bug Tracking

```typescript
interface WorkflowSettings {
  bugs: {
    enabled: boolean; // Enable bug tracking pipeline. Default: false
    createGithubIssues?: boolean; // Also create GitHub issues. Default: true
  };
}
```

---

## Post-Merge Verification

```typescript
interface WorkflowSettings {
  postMergeVerification?: boolean; // Run verification commands after merge. Default: true
  postMergeVerificationCommands?: string[]; // Commands to run. Default: ['npm run typecheck']
}
```

When enabled, runs verification commands after merge to catch regressions. On failure, a bug-fix feature is created on the board. `npm run build:packages` is added automatically when `libs/` files were touched.

---

## Queue Saturation and Error Budget

### Review Queue Limit

```typescript
interface WorkflowSettings {
  maxPendingReviews?: number; // Pause feature pickup when queue is full. Default: 5
}
```

When the number of features awaiting human review reaches `maxPendingReviews`, the system pauses automatic feature pickup to prevent unbounded queue growth.

### Error Budget

```typescript
interface WorkflowSettings {
  errorBudgetWindow?: number; // Rolling window in days. Default: 7
  errorBudgetThreshold?: number; // CFR threshold (0.0–1.0). Default: 0.2
  errorBudgetAutoFreeze?: boolean; // Pause pickup when budget exhausted. Default: true
}
```

The error budget tracks the Change Failure Rate (CFR) over a rolling window. When CFR exceeds the threshold, the system pauses new feature pickup (running agents are unaffected). Pickup resumes automatically when the budget recovers (burn rate drops below 0.8).

- `errorBudgetWindow: 7` → calculate CFR over the last 7 days
- `errorBudgetThreshold: 0.2` → alert/pause when 20%+ of changes cause failures

---

## Agent Configuration

Per-project agent assignment and model override settings, stored under `agentConfig` in `.automaker/settings.json`:

```typescript
interface AgentConfig {
  /** Per-role model overrides */
  roleModelOverrides?: Record<string, PhaseModelEntry>;
  /** Enable match-rule auto-assignment. Default: true */
  autoAssignEnabled?: boolean;
  /** Per-role system prompt overrides */
  rolePromptOverrides?: Record<string, CustomPrompt>;
}
```

See [Agent Manifests](../agents/agent-manifests.md) for full configuration details.

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
  retro: { enabled: true },
  cleanup: { autoCleanupEnabled: true, staleThresholdHours: 4 },
  signalIntake: {
    defaultCategory: 'ops',
    autoResearch: false,
    autoApprovePRD: false,
  },
  bugs: { enabled: false, createGithubIssues: true },
  postMergeVerification: true,
  postMergeVerificationCommands: ['npm run typecheck'],
  preFlightChecks: true,
  phaseTemperatures: { PLAN: 1.0, EXECUTE: 0, REVIEW: 0.5 },
};
```

---

## Related Documentation

- [Lead Engineer Pipeline](../dev/lead-engineer-pipeline.md) — how processors use these settings
- [DORA Metrics](./dora-metrics.md) — error budget and CFR tracking
- [Antagonistic Review](../protolabs/antagonistic-review.md) — the plan review gate
- [Agent Manifests](../agents/agent-manifests.md) — per-role model and prompt overrides
