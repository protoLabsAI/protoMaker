# Feature Status System

## Canonical Status Flow

protoLabs uses a consolidated status system for all features:

```
backlog → in_progress → review → done
             ↓           ↓
          blocked ← ← ← ┘
```

`interrupted` is an exceptional state (server shutdown mid-execution) — it sits outside the normal flow and is treated the same as `blocked` for recovery purposes.

### Status Definitions

| Status          | Description              | When Used                                        |
| --------------- | ------------------------ | ------------------------------------------------ |
| **backlog**     | Queued, ready to start   | Initial state for new features                   |
| **in_progress** | Being worked on          | Agent is actively implementing                   |
| **review**      | PR created, under review | After git workflow creates PR                    |
| **blocked**     | Temporary halt           | Dependency issues, failures, or manual blocks    |
| **done**        | PR merged, work complete | After PR is merged to main                       |
| **interrupted** | Server shutdown mid-run  | Exceptional: set when server stops mid-execution |

### Legacy Status Migration

The system automatically normalizes legacy status values:

| Legacy Status      | Canonical Status |
| ------------------ | ---------------- |
| `pending`          | `backlog`        |
| `ready`            | `backlog`        |
| `running`          | `in_progress`    |
| `completed`        | `done`           |
| `waiting_approval` | `done`           |
| `verified`         | `done`           |
| `failed`           | `blocked`        |

**Migration is automatic** - The feature-loader normalizes statuses on read, so no manual migration is required.

## Implementation Details

### Backend (libs/types)

```typescript
import { normalizeFeatureStatus } from '@protolabsai/types';

// Defensive normalization
const status = normalizeFeatureStatus(feature.status, (from, to) => {
  console.log(`Normalizing: ${from} → ${to}`);
});
```

The `normalizeFeatureStatus()` function:

- Maps legacy values to canonical values
- Returns canonical values unchanged (fast path)
- Defaults to `backlog` for undefined/unknown values
- Supports telemetry callback for tracking migrations

### Feature Loader

The `FeatureLoader` service automatically normalizes all features on read:

```typescript
// In getAll() and get()
return this.normalizeFeature(feature);
```

This ensures all features use canonical statuses throughout the system.

### UI Columns

The UI displays 5 columns (excluding pipeline steps):

1. **Backlog** - Gray
2. **In Progress** - Yellow
3. **Review** - Blue
4. **Blocked** - Red
5. **Done** - Green

CSS variables: `--status-backlog`, `--status-in-progress`, `--status-review`, `--status-blocked`, `--status-done`

### Auto-Mode Selection

Auto-mode picks up features with `status === 'backlog'`:

```typescript
const isEligibleStatus = feature.status === 'backlog';
```

Features in `review` or `done` are not eligible for auto-execution.

### Foundation Dependencies

Features marked with `isFoundation: true` enforce stricter dependency satisfaction. When a feature depends on a foundation feature, it will **not** start until the foundation reaches `done` (PR merged to main). The default behavior — where `review` status satisfies a dependency — is bypassed for foundation deps.

This prevents the "18-PR cascade problem" where multiple agents scaffold the same package directory because they all branch from `origin/main` before the scaffold PR is merged.

```typescript
// Foundation dep in 'review' → NOT satisfied (must be 'done')
// Normal dep in 'review' → satisfied (work is complete, PR under review)
```

**When is `isFoundation` set automatically?**

- Phase 1 of each milestone in project orchestration gets `isFoundation: true`
- Can be set manually via MCP `create_feature` / `update_feature` tools

**Statuses that satisfy a foundation dependency:** `done`, `completed`
**Statuses that satisfy a normal dependency:** `done`, `completed`, `review`

## Backwards Compatibility

Legacy statuses are fully supported:

- Old feature.json files load correctly (normalized on read)
- No breaking changes for users
- System continues to work with mixed status values
- UI handles unknown statuses defensively (warns + defaults to backlog)

## Testing

Unit tests verify normalization for all cases:

- 6 canonical statuses (passthrough: backlog, in_progress, review, blocked, done, interrupted)
- 7 legacy statuses (migration: pending, ready, running, completed, waiting_approval, verified, failed)
- Undefined status (default to backlog)
- Unknown status (warn + default to backlog)

Additionally, tests verify telemetry callback invocation for metrics.

## Benefits

1. **Single Source of Truth** - 5 canonical values, no overlapping semantics
2. **Clear Flow** - Unambiguous progression from backlog to done
3. **Defensive** - Automatic normalization prevents invalid states
4. **Backwards Compatible** - No migration required, works transparently
5. **Telemetry** - Track legacy usage for monitoring
6. **Authority Integration** - WorkItemState preserved for future integration

## Feature Lifecycle Tracking

Three history arrays on the `Feature` type capture an audit trail of how a feature evolved over time.

### ExecutionRecord

Each time an agent runs against a feature, an `ExecutionRecord` is appended to `feature.executionHistory`:

```typescript
interface ExecutionRecord {
  id: string; // Unique execution ID
  startedAt: string; // ISO 8601 start time
  completedAt?: string; // ISO 8601 end time
  durationMs?: number; // Total wall-clock duration
  costUsd?: number; // Total cost in USD (from SDK total_cost_usd)
  inputTokens?: number;
  outputTokens?: number;
  model: string; // Model used (e.g. "claude-sonnet-4-5")
  success: boolean;
  error?: string; // Error message on failure
  turnCount?: number; // Number of turns the agent took
  trigger: 'auto' | 'manual' | 'retry';
}
```

`feature.costUsd` is the **total** cost across all executions. The history array lets you see per-run cost attribution, model choices, and failure reasons.

### StatusTransition

Each status change appends a `StatusTransition` to `feature.statusHistory`:

```typescript
interface StatusTransition {
  from: FeatureStatus | null; // null on initial assignment
  to: FeatureStatus;
  timestamp: string; // ISO 8601
  reason?: string; // e.g. "PR merged", "dependency unblocked"
}
```

The history array is append-only and provides a complete audit trail of the feature's lifecycle.

### DescriptionHistoryEntry

Each time a feature's description changes, a `DescriptionHistoryEntry` is appended to `feature.descriptionHistory`:

```typescript
interface DescriptionHistoryEntry {
  description: string;
  timestamp: string;
  source: 'initial' | 'enhance' | 'edit';
  enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';
}
```

- `initial` — the description as first created
- `enhance` — AI-enhanced via the enhancement pipeline; `enhancementMode` identifies which prompt variant was used
- `edit` — manually edited by the user

---

## Git Workflow Error Field

Features carry an optional `gitWorkflowError` field that captures git operation failures without changing the feature status:

```typescript
interface Feature {
  gitWorkflowError?: {
    message: string; // Error description
    timestamp: string; // ISO 8601 when the error occurred
  };
}
```

When a git workflow step (commit, push, PR creation) fails, the error is persisted to `feature.json`. The feature status remains unchanged. This makes git failures visible in the UI without disrupting the state machine.

## Status Change Events

Status transitions emit typed events (via pipeline processors and `FeatureLoader.update()`):

| Event                    | When                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `feature:status-changed` | Every status transition (carries `previousStatus` and `newStatus`) |
| `feature:completed`      | Feature reaches `done`                                             |
| `feature:error`          | Feature reaches `failed` or `blocked`                              |

These events drive downstream integrations: Langfuse scoring, ceremony triggers, UI real-time updates.

## Drift Detection & Auto-Reconciliation

Board consistency drift occurs when a feature's status doesn't automatically update after its PR merges — most commonly leaving features stuck in `blocked` or `review`. Three mechanisms work together to prevent and correct this:

### Layer 1 — Auto-Mode Poll (fastest)

Every time auto-mode polls for pending work, `loadPendingFeatures()` fetches recently merged PRs alongside open PRs. Any `blocked` or `review` feature whose branch has a merged PR is immediately transitioned to `done` before dependency evaluation runs. This means drift is corrected within seconds whenever auto-mode is active.

### Layer 2 — GitHub Webhook (real-time)

`POST /webhooks/github` handles `pull_request` closed events from GitHub. When a PR is merged, the handler looks up the feature by branch name and transitions it to `done`, emitting a `feature:pr-merged` event for UI notification.

The endpoint is **enabled by default** and protected by HMAC signature verification when `webhookSecrets.github` is configured in credentials. To explicitly disable it, set `githubWebhook.enabled: false` in global settings.

To configure the webhook in GitHub:

1. Go to **Settings → Webhooks → Add webhook**
2. Set payload URL to `https://api.protolabs.studio/webhooks/github`
3. Content type: `application/json`
4. Secret: value from `credentials.json > webhookSecrets.github`
5. Events: **Pull requests** + **Pull request reviews**

### Layer 3 — Lead Engineer Fast-Path Rules (catch-all)

The Lead Engineer's fast-path rules evaluate on every event and catch drift that webhooks miss. The `pr-merged-drift` rule detects features stuck in `review` or `blocked` whose PRs have already merged and transitions them to `done`. Additional rules detect CI failures, stale PRs, and unresolved review threads.

### Maximum Drift Window

| Scenario                                | Maximum correction delay  |
| --------------------------------------- | ------------------------- |
| Auto-mode running, PR merges            | Seconds (next poll cycle) |
| Webhook configured + GitHub sends event | < 5 seconds               |
| Webhook not configured, auto-mode idle  | 5 minutes (drift scan)    |

## Lead Engineer World State

The Lead Engineer service maintains a `LeadWorldState` snapshot for each active project. This world state is the source of truth for fast-path rule evaluation — rules receive the world state as a pure input and return `LeadRuleAction[]` without side effects.

### LeadWorldState

```typescript
interface LeadWorldState {
  projectPath: string;
  projectSlug: string;
  updatedAt: string;
  boardCounts: Record<string, number>; // Counts per FeatureStatus
  features: Record<string, LeadFeatureSnapshot>; // featureId → snapshot
  agents: LeadAgentSnapshot[]; // Currently running agents
  openPRs: LeadPRSnapshot[]; // Open PR tracking
  milestones: LeadMilestoneSnapshot[]; // Milestone progress
  metrics: {
    totalFeatures: number;
    completedFeatures: number;
    totalCostUsd: number;
    avgCycleTimeMs?: number;
  };
  autoModeRunning: boolean;
  maxConcurrency: number;
}
```

### Snapshot Types

| Type                    | Key Fields                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `LeadFeatureSnapshot`   | `id`, `status`, `branchName`, `prNumber`, `costUsd`, `failureCount`, `complexity`, `isFoundation` |
| `LeadAgentSnapshot`     | `featureId`, `startTime`, `branch`                                                                |
| `LeadPRSnapshot`        | `featureId`, `prNumber`, `reviewState`, `ciStatus`, `isRemediating`, `remediationCount`           |
| `LeadMilestoneSnapshot` | `slug`, `title`, `totalPhases`, `completedPhases`                                                 |

### FeatureState Enum

The Lead Engineer tracks a richer internal state machine than the 6-status board. `FeatureState` is the full pipeline:

```
INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE
                                                       ↑
                                                  ESCALATE ←── any state
```

| State      | Description                                                               |
| ---------- | ------------------------------------------------------------------------- |
| `INTAKE`   | Feature created, awaiting triage                                          |
| `PLAN`     | Requirements analysis, structured plan generation, antagonistic review    |
| `EXECUTE`  | Implementation in progress (agent in worktree)                            |
| `REVIEW`   | PR open, awaiting reviewer approval + CI                                  |
| `MERGE`    | PR approved and CI passing, merging via gh CLI                            |
| `DEPLOY`   | Post-merge verification (typecheck, build), reflection, goal verification |
| `DONE`     | Fully deployed and verified (terminal state)                              |
| `ESCALATE` | Blocked; needs human intervention or auto-retry via fast-path rules       |

### Fast-Path Rules

Fast-path rules are pure functions evaluated on every inbound event:

```typescript
interface LeadFastPathRule {
  name: string;
  description: string;
  triggers: string[]; // Event types that activate this rule
  evaluate: (
    worldState: LeadWorldState,
    eventType: string,
    eventPayload: unknown
  ) => LeadRuleAction[];
}
```

Rules return `LeadRuleAction[]` — a discriminated union of side-effectful actions the executor applies:

```typescript
type LeadRuleAction =
  | { type: 'move_feature'; featureId: string; toStatus: FeatureStatus }
  | { type: 'reset_feature'; featureId: string; reason: string }
  | { type: 'unblock_feature'; featureId: string }
  | { type: 'enable_auto_merge'; featureId: string; prNumber: number }
  | { type: 'resolve_threads_direct'; featureId: string; prNumber: number }
  | { type: 'restart_auto_mode'; projectPath: string; maxConcurrency?: number }
  | { type: 'stop_agent'; featureId: string }
  | { type: 'abort_and_resume'; featureId: string; resumePrompt: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'update_feature'; featureId: string; updates: { ... } }
  | { type: 'project_completing' }
  | { type: 'rollback_feature'; featureId: string; projectPath: string; reason: string };
```

### Phase Handoffs

At the end of each Lead Engineer phase, a `PhaseHandoff` document is persisted to `.automaker/features/{featureId}/handoff-{phase}.json`:

```typescript
interface PhaseHandoff {
  phase: string;
  summary: string;
  discoveries: string[];
  modifiedFiles: string[];
  outstandingQuestions: string[];
  scopeLimits: string[];
  testCoverage: string;
  verdict: 'APPROVE' | 'WARN' | 'BLOCK';
  createdAt: string;
}
```

A `BLOCK` verdict prevents the pipeline from advancing to the next phase. `WARN` advances but surfaces the concern. `APPROVE` signals the phase is clean.

### Lead Engineer Session

The Lead Engineer maintains one `LeadEngineerSession` per managed project:

```typescript
interface LeadEngineerSession {
  projectPath: string;
  projectSlug: string;
  flowState: 'idle' | 'running' | 'completing' | 'stopped';
  worldState: LeadWorldState;
  startedAt: string;
  ruleLog: LeadRuleLogEntry[]; // Rolling 200-entry log of rule evaluations
  actionsTaken: number;
}
```

**File location:** `libs/types/src/lead-engineer.ts`

---

## Future Work

- Integrate Authority System `workItemState` with canonical statuses
- Add status transition guards in policy engine
- Add analytics dashboard for status flow metrics
