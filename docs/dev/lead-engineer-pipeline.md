# Lead Engineer Pipeline

The Lead Engineer pipeline is a state machine that orchestrates AI-assisted feature implementation across seven phases: **INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE** (plus ESCALATE from any state). Each phase is handled by a dedicated `StateProcessor` that encapsulates the logic for that stage.

For the full system context (auto-mode, maintenance tasks, ceremonies, timing reference), see [System Architecture](./system-architecture.md).

## Architecture Overview

```
Feature Request
     │
     ▼
┌─────────────┐
│   INTAKE    │  Classify complexity, assign persona, validate dependencies
└──────┬──────┘
       │
  ┌────+────┐
  │         │
needs     simple
plan     feature
  │         │
  ▼         │
┌─────────────┐ │
│    PLAN     │ │  Generate implementation plan, antagonistic review gate
└──────┬──────┘ │
       │        │
       +────────+
       │
       ▼
┌─────────────┐
│   EXECUTE   │◄──┐  Run agent in worktree, monitor completion, handle retries
└──────┬──────┘   │
       │          │ changes requested (max 4 cycles)
       ▼          │
┌─────────────┐   │
│   REVIEW    │───┘  Poll PR: CI status, review decision, thread count (30s interval)
└──────┬──────┘
       │ approved + CI passing
       ▼
┌─────────────┐
│    MERGE    │  gh pr merge --merge, retry with 60s delay
└──────┬──────┘
       │ PR merged
       ▼
┌─────────────┐
│   DEPLOY    │  Post-merge verification (typecheck, build), generate reflection
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    DONE     │  Terminal. Cleanup checkpoint, save trajectory, emit completion.
└─────────────┘

Any state on unrecoverable error:
┌─────────────┐
│  ESCALATE   │  Classify failure, HITL form or auto-retry via fast-path rules
└─────────────┘
```

Each processor implements the `StateProcessor` interface with an `enter/process/exit` lifecycle.

### Transition Limits

| Limit                                  | Value | Purpose                             |
| -------------------------------------- | ----- | ----------------------------------- |
| Max state-to-state transitions         | 20    | Prevents infinite loops             |
| Max same-state polls (REVIEW)          | 100   | Caps polling loops                  |
| Checkpoint saved after each transition | --    | Enables resume after server restart |

---

## INTAKE Phase (`IntakeProcessor`)

### Responsibilities

The `IntakeProcessor` prepares the feature for execution:

1. **Load and validate** the feature record
2. **Check blocking dependencies** — halt if upstream features are incomplete
3. **Classify complexity** — small, medium, large, or architectural
4. **Assign persona** — maps domain to a specialized role
5. **Select model** — chooses the appropriate LLM for execution
6. **Mark as in-progress** — updates feature status and persists metadata

### Persona Assignment

The intake processor assigns an engineering persona based on the feature's domain:

| Domain                                | Persona               |
| ------------------------------------- | --------------------- |
| `qa`, `test`                          | `qa-engineer`         |
| `doc`, `readme`, `changelog`          | `docs-engineer`       |
| `ui`, `frontend`, `component`, `page` | `frontend-engineer`   |
| `infra`, `deploy`, `ci`, `docker`     | `devops-engineer`     |
| `manage`, `plan`, `retro`             | `engineering-manager` |
| _(all others)_                        | `backend-engineer`    |

### Plan Requirement

The PLAN phase runs when any of the following are true:

- Complexity is `architectural` or `large`
- The feature touches 3 or more files

Simple features (`small`/`medium`, ≤2 files) skip PLAN and go directly to EXECUTE.

### Model Selection

Model selection follows a priority cascade:

1. **Feature-specified model** — explicit `model` field on the feature record
2. **Escalation model** — after 2+ prior failures, escalate to `claude-opus-*`
3. **Architectural complexity** — always uses `claude-opus-*`
4. **User-configured model** — `agentExecution.model` from workflow settings
5. **Complexity-based fallback**:
   - `small` → `claude-haiku-*`
   - `medium/large/architectural` → `claude-sonnet-*`
6. **Default** — `claude-sonnet-*`

---

## PLAN Phase (`PlanProcessor`)

### Responsibilities

The `PlanProcessor` generates an actionable implementation plan before the agent runs code:

1. **Generate plan** via `simpleQuery()` using a complexity-appropriate model
2. **Validate plan quality** — rejects plans under 100 characters or prefixed with `UNCLEAR:`
3. **Antagonistic review gate** — for large/architectural features
4. **Persist plan handoff** — saves plan for the EXECUTE processor

### Plan Generation

The plan is generated using a structured prompt that includes the feature description, project context, existing codebase structure, and any blocker/dependency notes. The model used mirrors the complexity tier from INTAKE.

**Retry behavior**: If validation fails, the processor retries up to 2 times. After max retries, the feature description itself is used as the plan (with a warning logged).

### Antagonistic Review Gate

For `large` or `architectural` features, the plan is submitted to the `AntagonisticReviewService.verifyPlan()` before proceeding.

- **Approved** → proceed to EXECUTE
- **Rejected** → regenerate plan (up to 2 retries), then proceed anyway if retries exhausted
- **Service unavailable** → fallback to an inline `simpleQuery()` with a critical evaluation prompt

To disable for specific projects, set `pipeline.antagonisticPlanReview: false` in [workflow settings](#configuration).

### Plan Handoff

After a successful plan, a handoff record is written with:

- Plan text summary
- Verdict (`APPROVE` or `WARN` if review had concerns)
- Model used for planning

---

## EXECUTE Phase (`ExecuteProcessor`)

### Responsibilities

The `ExecuteProcessor` runs the feature agent inside a git worktree and manages the full execution lifecycle:

1. **Budget enforcement** — blocks execution if cost limit exceeded
2. **Pre-flight checks** — validates worktree state and dependencies
3. **Agent launch** — spawns the agent process in the worktree
4. **Completion monitoring** — waits for events with timeout
5. **Failure classification** — routes failures to the right retry strategy
6. **Context shaping** — enhances retry context with prior output and learnings
7. **Trajectory storage** — persists execution data for the learning flywheel
8. **Lead handoff** — extracts final verdict from agent output

### Budget Enforcement

Execution is blocked when:

- Total feature cost exceeds `$10 USD` (configurable via `pipeline.maxAgentCostUsd`)
- A `kill_condition` flag is set in the feature metadata

### Pre-Flight Checks

Before launching the agent, the processor validates the worktree environment:

| Check                 | What It Does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| **Worktree currency** | `git fetch` + `git rebase origin/dev` to sync with the latest changes |
| **Package builds**    | Ensures all required packages are compiled before the agent runs      |
| **Dependency merge**  | Verifies blocking dependencies have been merged and are available     |

Pre-flight checks can be disabled globally via `preFlightChecks.enabled: false`.

### Event-Driven Completion

The processor listens for one of three completion events:

| Event               | Meaning                                         |
| ------------------- | ----------------------------------------------- |
| `feature:completed` | Agent finished successfully                     |
| `feature:stopped`   | Agent was halted (budget, kill condition, etc.) |
| `feature:error`     | Agent encountered an unrecoverable error        |

**Timeout**: 30 minutes (configurable via `pipeline.maxAgentRuntimeMinutes`)

### Failure Classification

Failures are classified into three categories, each with different retry semantics:

#### Fatal Infrastructure Failures

Immediate escalation, no retry:

- Permission denied errors
- Worktree corruption or missing
- Unresolvable merge conflicts
- Timeout without any progress

#### Transient Infrastructure Failures

Retry without re-running the agent (does NOT consume agent retry budget):

- Lock file conflicts
- Git push blocked by another push
- Temporary network or disk errors

#### Agent Failures

Retry with accumulated context (consumes agent retry budget):

- Agent reached wrong conclusion
- Test failures
- Build errors with fixable root cause

### Retry Configuration

Both retry budgets are configurable per-project via workflow settings:

```yaml
pipeline:
  maxAgentRetries: 3 # How many times the agent re-runs
  maxInfraRetries: 3 # How many transient infra retries allowed
```

Infrastructure retries are tracked separately from agent retries—a transient infra failure won't burn your agent retry budget.

### Context Shaping for Retries

On retry, the `ContextFidelityService` enriches the agent's context with:

- **Prior agent output** — what was tried and what happened
- **Sibling reflections** — learnings from similar prior features (via FTS5 semantic search)
- **Plan output** — the implementation plan from the PLAN phase
- **Review feedback** — any antagonistic review concerns

The FTS5 semantic search falls back to loading `facts.json` from the trajectory directory or `reflection.md` files from related features.

### Lead Handoff

After execution, the processor parses the agent's output to extract:

- **Modified files** list
- **Questions** or blockers identified
- **Verdict**: `APPROVE`, `WARN`, or `BLOCK`

This handoff is saved and drives downstream review routing.

### Trajectory Storage

Each execution is written to the trajectory store for the learning flywheel. Facts are extracted from successful completions via `FactStoreService` (fire-and-forget, doesn't block completion).

---

## REVIEW Phase (`ReviewProcessor`)

### Responsibilities

The `ReviewProcessor` monitors the PR through CI and code review:

1. **Poll PR state** every 30 seconds via `PRFeedbackService` (fallback: `gh pr view`)
2. **Detect external merges** via branch name + git merged-at timestamp
3. **Route based on review decision** -- approved, changes requested, or pending

### Review Decision Routing

| Decision                  | Action                                                              | Budget                         |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| **Approved + CI passing** | Transition to MERGE, save REVIEW handoff                            | --                             |
| **Changes requested**     | Capture feedback via `gh pr view ... reviews`, loop back to EXECUTE | Max 4 remediation cycles       |
| **Pending/commented**     | Continue polling every 30s                                          | 45 min timeout before escalate |

### Concurrency Guard

If `PRFeedbackService` is already remediating the same feature (e.g., from a CodeRabbit webhook), the ReviewProcessor defers to avoid a concurrency race.

### Review Start Tracking

A `Map<featureId, startTime>` prevents the pending timeout from resetting on each re-check. The timer starts on first entry to REVIEW and persists across polling cycles.

### Escalation Triggers

- No PR found for the feature
- Invalid or missing PR number
- Max remediation cycles (4) exhausted
- Max PR iterations (2) exhausted (CodeRabbit review loops)
- Pending review >45 minutes with no decision

---

## MERGE Phase (`MergeProcessor`)

### Responsibilities

The `MergeProcessor` merges the approved PR:

1. **Merge PR** via `gh pr merge N --merge` (always merge commits, never squash on promotion PRs)
2. **Detect success** by parsing stdout for "Merging" + status code
3. **Update feature status** to `done` on the board
4. **Emit `feature:pr-merged`** event (consumed by Board Janitor rules, PRMergePoller)

### Retry Behavior

If the merge command fails (e.g., branch protection, CI still running), the processor retries with a 60-second delay between attempts.

### Merge Strategy

Feature PRs to dev use `--squash` by default (configurable via `prMergeStrategy` in workflow settings). Promotion PRs (dev->staging, staging->main) always use `--merge` to preserve the DAG.

---

## DEPLOY Phase (`DeployProcessor`)

### Responsibilities

The `DeployProcessor` runs post-merge verification and captures learnings:

1. **Verify feature status** -- if not already `done`, update it
2. **Run post-merge verification** with 120-second timeout per command:
   - `npm run typecheck` (always)
   - `npm run build:packages` (if HEAD~1..HEAD touched `libs/`)
3. **Handle verification failure** -- create a bug-fix feature on the board with failure details
4. **Emit `feature:completed`** event (triggers board janitor, capacity rules, PRMergePoller)
5. **Generate reflection** via `simpleQuery()` with haiku (fire-and-forget, non-blocking, ~$0.001)
6. **Save trajectory** to `.automaker/trajectory/{featureId}/attempt-N.json` for the learning flywheel

### Reflection Feed-Forward

The reflection generated here is loaded by `ExecuteProcessor` for subsequent sibling features:

- **Sibling matching**: same `epicId` or same `projectSlug`
- **Recency cap**: top 3 most recently completed siblings
- **Injection**: added to agent context as "Learnings from Prior Features"

---

## ESCALATE Phase (`EscalateProcessor`)

### Responsibilities

The `EscalateProcessor` handles failures from any state:

1. **Move feature to `blocked`** and increment `failureCount`
2. **Classify failure** via `FailureClassifierService`:
   - Pattern-matches the escalation reason string
   - Returns: `category`, `isRetryable`, `maxRetries`, `confidence`, `explanation`, `recoveryStrategy`
   - Persists classification to `feature.failureClassification`
3. **Emit `escalation:signal-received`** with structured failure data (triggers fast-path rules)
4. **Create HITL form** when failure is non-retryable OR max retries exhausted:
   - Resolution options: retry, provide_context, skip, close
   - Deduplication: skips if form already pending for this feature
5. **Save trajectory** to `.automaker/trajectory/{featureId}/attempt-N.json`

### Auto-Recovery via Fast-Path Rules

The `classifiedRecovery` rule listens for `escalation:signal-received` events:

- If `isRetryable` AND `confidence >= 0.7` AND `retryCount < maxRetries`: reset feature to backlog automatically
- Otherwise: leave blocked for HITL intervention

### HITL Form Response Handling

The `hitlFormResponse` rule processes user decisions:

| Resolution        | Action                                               |
| ----------------- | ---------------------------------------------------- |
| `retry`           | Reset `failureCount`, move to backlog                |
| `provide_context` | Add context to `statusChangeReason`, move to backlog |
| `skip`            | Move to done (marks complete without implementing)   |
| `close`           | Clear `awaitingGatePhase`, keep blocked              |

---

## Configuration

Workflow settings that affect the lead engineer pipeline:

```typescript
// libs/types/src/workflow-settings.ts
interface WorkflowSettings {
  pipeline: {
    goalGatesEnabled: boolean; // default: true
    checkpointEnabled: boolean; // default: true
    loopDetectionEnabled: boolean; // default: true
    supervisorEnabled: boolean; // default: true
    maxAgentRuntimeMinutes: number; // default: 45
    maxAgentCostUsd: number; // default: 15
    antagonisticPlanReview: boolean; // default: true
    maxAgentRetries: number; // default: 3
    maxInfraRetries: number; // default: 3
  };
  preFlightChecks: {
    enabled: boolean; // default: true
  };
}
```

See [Workflow Settings](../server/workflow-settings.md) for the full configuration reference.

---

## Related Files

| File                                                          | Role                                    |
| ------------------------------------------------------------- | --------------------------------------- |
| `apps/server/src/services/lead-engineer-service.ts`           | State machine orchestrator              |
| `apps/server/src/services/lead-engineer-processors.ts`        | `IntakeProcessor` and `PlanProcessor`   |
| `apps/server/src/services/lead-engineer-execute-processor.ts` | `ExecuteProcessor`                      |
| `apps/server/src/services/lead-engineer-rules.ts`             | 17 fast-path rules (pure functions)     |
| `apps/server/src/services/pr-feedback-service.ts`             | PR polling and remediation for REVIEW   |
| `apps/server/src/services/antagonistic-review-service.ts`     | Plan review gate                        |
| `apps/server/src/services/git-workflow-service.ts`            | Post-completion git workflow for DEPLOY |
| `libs/types/src/workflow-settings.ts`                         | Configuration types                     |
| `libs/types/src/lead-engineer.ts`                             | State machine types                     |
| `docs/dev/system-architecture.md`                             | Full system architecture with timing    |
| `docs/server/workflow-settings.md`                            | Settings reference                      |
