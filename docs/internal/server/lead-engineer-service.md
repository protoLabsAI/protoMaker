# Lead Engineer Service

State-machine-driven feature execution pipeline that classifies complexity, generates implementation plans, and runs agent execution with escalation handling.

## Overview

The Lead Engineer pipeline processes features through discrete state phases, each handled by a dedicated `StateProcessor`. The full pipeline is:

| Phase      | Processor              | Description                                                      |
| ---------- | ---------------------- | ---------------------------------------------------------------- |
| `INTAKE`   | `IntakeProcessor`      | Load feature, classify complexity, assign persona, validate deps |
| `PLAN`     | `PlanProcessor`        | Generate implementation plan, run antagonistic plan review       |
| `EXECUTE`  | `ExecuteProcessor`     | Run agent in worktree, monitor completion, retry on failure      |
| `REVIEW`   | `ReviewProcessor`      | Monitor PR: CI status, CodeRabbit feedback, approval state       |
| `MERGE`    | `MergeProcessor`       | Verify CI passing, merge PR to target branch                     |
| `DEPLOY`   | `DeployProcessor`      | Post-merge deployment verification, transitions to DONE          |
| `DONE`     | _(terminal)_           | Feature fully deployed; cleanup, metrics stored                  |
| `ESCALATE` | _(escalation handler)_ | Surface blocked/failed features to the board                     |

## Architecture

```text
LeadEngineerService (orchestrator)
  ├── FeatureStateMachine          — per-feature state transitions (lead-engineer-state-machine.ts)
  │     ├── IntakeProcessor          — entry point for every feature
  │     ├── PlanProcessor            — plan generation + quality gate
  │     ├── ExecuteProcessor         — agent invocation + monitoring
  │     ├── ReviewProcessor          — PR monitoring and feedback cycles
  │     ├── MergeProcessor           — CI verification and PR merge
  │     ├── DeployProcessor          — post-merge verification → DONE
  │     └── EscalateProcessor        — blocked/failed feature handling
  ├── PersistQueue               — background checkpoint I/O (inside FeatureStateMachine)
  ├── WorldStateBuilder          — board snapshot + incremental updates
  ├── ActionExecutor             — fast-path rule execution + supervisor
  ├── CeremonyOrchestrator       — project completion ceremonies
  ├── PipelineCheckpointService  — durable state checkpoints (DATA_DIR/checkpoints/)
  └── LeadEngineerSessionStore   — session persistence (DATA_DIR/lead-engineer-sessions.json)

Each processor implements StateProcessor:
  enter(ctx)   → side effects on state entry
  process(ctx) → returns StateTransitionResult { nextState, shouldContinue, reason }
  exit(ctx)    → cleanup on state exit
```

### Goal Gates

`FeatureStateMachine` validates pre- and post-conditions on each state transition via goal gates:

| Gate ID         | When evaluated          | What it checks                                            |
| --------------- | ----------------------- | --------------------------------------------------------- |
| `execute-entry` | Before entering EXECUTE | Feature has a description or title                        |
| `execute-exit`  | After leaving EXECUTE   | PR was created (`prNumber` exists); retry target: EXECUTE |
| `review-exit`   | After leaving REVIEW    | Delegated to processor (always passes at gate level)      |
| `merge-exit`    | After leaving MERGE     | Merge confirmed by processor; retry target: MERGE         |

Goal gates can be disabled project-wide via `pipeline.goalGatesEnabled: false` in workflow settings.

### Session Persistence

`LeadEngineerSessionStore` persists active sessions to `DATA_DIR/lead-engineer-sessions.json` (a single multi-project file keyed by `projectPath`). On server restart, `restore()` replays all persisted sessions so auto-mode resumes automatically.

### Durable Workflow Checkpoints

When `pipeline.checkpointEnabled` is `true` in workflow settings, `FeatureStateMachine` saves a checkpoint after every successful state transition. Checkpoints live at:

```
{projectPath}/.automaker/checkpoints/{featureId}.json
```

Each checkpoint records the current state, state context, completed-states list, and goal-gate results. This enables crash recovery: on `start()`, `LeadEngineerService` scans all existing checkpoints for the project and queues them for resume in `pendingResumes`. A 60-second interval (`RESUME_POLL_MS`) re-triggers `process()` for each suspended feature.

**Checkpoint I/O is non-blocking.** `FeatureStateMachine` delegates all checkpoint writes to an internal `PersistQueue` that retries asynchronously with exponential backoff (3 attempts: 100 ms → 200 ms → 400 ms). State transitions proceed immediately without waiting for the disk write to complete.

**Suspended states.** If `ReviewProcessor` or `MergeProcessor` returns a self-loop (same `nextState` as current), the state machine emits `pipeline:feature-suspended`, saves the checkpoint, and exits cleanly. The resume interval re-queues the feature rather than busy-polling inside the event loop.

**Reconciliation.** `reconcileCheckpoints(projectPath)` removes orphaned checkpoint files for features that no longer exist on the board. Call it after bulk board cleanup to avoid accumulating stale checkpoints.

**Terminal cleanup.** On reaching `DONE`, `DEPLOY`, or `ESCALATE`, the checkpoint file is deleted automatically.

## INTAKE Phase

`IntakeProcessor` runs before any agent work begins:

1. **Dependency validation** — calls `getBlockingDependencies()` from `@protolabsai/dependency-resolver`. If unmet deps exist → transition to `ESCALATE`.
2. **Complexity classification** — defaults to `'medium'` if not already set on the feature.
3. **Persona assignment** — selects agent role (`lead-engineer`, `architect`, etc.) based on feature domain.
4. **Model selection** — resolves the execution model via `getPhaseModelWithOverrides()` respecting project-level settings.
5. **Board update** — marks feature `in_progress` and persists `complexity` and `selectedModel`.

## PLAN Phase

`PlanProcessor` runs for features that `requiresPlan()` returns `true` (typically `large` or `architectural` complexity):

1. **Prompt assembly** — builds a structured implementation plan prompt with feature context.
2. **Plan generation** — calls `simpleQuery()` with the configured `planningModel`.
3. **Antagonistic review gate** — delegates to `AntagonisticReviewService.verifyPlan()`. If the plan is rejected, the feature is escalated with the rejection reason.
4. **Plan storage** — persists the approved plan to the feature record for the agent to reference during execution.

## EXECUTE Phase

`ExecuteProcessor` invokes the Claude Agent SDK with:

- Worktree path as working directory
- Assembled prompt (feature description + plan if available + context files)
- MCP servers from settings
- Stream observer for loop detection
- Post-agent hook: `checkAndRecoverUncommittedWork()` (worktree recovery)

On `LoopDetectedError`, execution retries once with recovery guidance injected into the prompt.

## REVIEW Phase

`ReviewProcessor` polls GitHub via `PRFeedbackService` every 60 seconds:

- On `changes_requested`: collect CodeRabbit/reviewer feedback and send to the agent for remediation (max 2 feedback cycles per review round)
- On `approved` + CI passing → MERGE
- On CI failure → back to EXECUTE with failure context
- Max 4 total remediation cycles before escalation to ESCALATE

## MERGE Phase

`MergeProcessor` verifies CI is green and merges the PR using the strategy configured in `workflowSettings` (squash, merge, or rebase). Emits `feature:pr-merged`. Board status transitions to `done`.

## DEPLOY Phase

`DeployProcessor` handles post-merge verification. Transitions directly to `DONE` once deployment checks pass. Terminal transition: `{ nextState: 'DONE', shouldContinue: false }`.

## State Context

```typescript
interface StateContext {
  feature: Feature;
  projectPath: string;
  worktreePath?: string;
  assignedPersona?: AgentRole;
  selectedModel?: string;
  planRequired?: boolean;
  planOutput?: string;
  escalationReason?: string;
}
```

## Key Files

| File                                                                | Role                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/server/src/services/lead-engineer-service.ts`                 | Orchestrator: wires `FeatureStateMachine`, `ActionExecutor`, session store      |
| `apps/server/src/services/lead-engineer-state-machine.ts`           | `FeatureStateMachine` class + `PersistQueue` + default goal gate definitions    |
| `apps/server/src/services/lead-engineer-processors.ts`              | `IntakeProcessor` and `PlanProcessor`                                           |
| `apps/server/src/services/lead-engineer-execute-processor.ts`       | `ExecuteProcessor`                                                              |
| `apps/server/src/services/lead-engineer-review-merge-processors.ts` | `ReviewProcessor` and `MergeProcessor`                                          |
| `apps/server/src/services/lead-engineer-deploy-processor.ts`        | `DeployProcessor`                                                               |
| `apps/server/src/services/lead-engineer-session-store.ts`           | Session persistence to `DATA_DIR/lead-engineer-sessions.json`                   |
| `apps/server/src/services/lead-engineer-types.ts`                   | `StateProcessor`, `StateContext`, `ProcessorServiceContext`, timing consts      |
| `apps/server/src/services/pipeline-checkpoint-service.ts`           | File-based checkpoint persistence under `{projectPath}/.automaker/checkpoints/` |

## See Also

- [Auto Mode Service](./auto-mode-service) — schedules features and delegates to `LeadEngineerService`
- [Antagonistic Review](./antagonistic-review) — plan quality gate called from `PlanProcessor`
- [Worktree Recovery Service](./worktree-recovery-service) — post-agent hook in `ExecuteProcessor`
