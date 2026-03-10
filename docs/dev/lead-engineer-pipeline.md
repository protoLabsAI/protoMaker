# Lead Engineer Pipeline

The Lead Engineer pipeline is a state machine that orchestrates AI-assisted feature implementation across three sequential phases: **INTAKE → PLAN → EXECUTE**. Each phase is handled by a dedicated `StateProcessor` that encapsulates the logic for that stage.

## Architecture Overview

```
Feature Request
     │
     ▼
┌─────────────┐
│   INTAKE    │  Classify complexity, assign persona, validate dependencies
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    PLAN     │  Generate implementation plan, antagonistic review gate
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   EXECUTE   │  Run agent in worktree, monitor completion, handle retries
└─────────────┘
```

Each processor implements the `StateProcessor` interface with an `enter/process/exit` lifecycle.

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

| File                                                          | Role                                  |
| ------------------------------------------------------------- | ------------------------------------- |
| `apps/server/src/services/lead-engineer-processors.ts`        | `IntakeProcessor` and `PlanProcessor` |
| `apps/server/src/services/lead-engineer-execute-processor.ts` | `ExecuteProcessor`                    |
| `apps/server/src/services/antagonistic-review-service.ts`     | Plan review gate                      |
| `libs/types/src/workflow-settings.ts`                         | Configuration types                   |
| `docs/protolabs/antagonistic-review.md`                       | Antagonistic review system            |
| `docs/server/workflow-settings.md`                            | Settings reference                    |
