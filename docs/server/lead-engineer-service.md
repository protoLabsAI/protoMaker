# Lead Engineer Service

State-machine-driven feature execution pipeline that classifies complexity, generates implementation plans, and runs agent execution with escalation handling.

## Overview

The Lead Engineer pipeline processes features through discrete state phases, each handled by a dedicated `StateProcessor`. The four main phases are:

| Phase      | Processor              | Description                                                      |
| ---------- | ---------------------- | ---------------------------------------------------------------- |
| `INTAKE`   | `IntakeProcessor`      | Load feature, classify complexity, assign persona, validate deps |
| `PLAN`     | `PlanProcessor`        | Generate implementation plan, run antagonistic plan review       |
| `EXECUTE`  | `ExecuteProcessor`     | Run agent in worktree, monitor completion, retry on failure      |
| `ESCALATE` | _(escalation handler)_ | Surface blocked/failed features to the board                     |

## Architecture

```text
LeadEngineerService
  ├── IntakeProcessor       — entry point for every feature
  ├── PlanProcessor         — plan generation + quality gate
  ├── ExecuteProcessor      — agent invocation + monitoring
  └── EscalateProcessor     — blocked/failed feature handling

Each processor implements StateProcessor:
  enter(ctx)   → side effects on state entry
  process(ctx) → returns StateTransitionResult { nextState, shouldContinue, reason }
  exit(ctx)    → cleanup on state exit
```

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

| File                                                          | Role                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/server/src/services/lead-engineer-processors.ts`        | `IntakeProcessor` and `PlanProcessor`                                |
| `apps/server/src/services/lead-engineer-execute-processor.ts` | `ExecuteProcessor`                                                   |
| `apps/server/src/services/lead-engineer-types.ts`             | `StateProcessor`, `StateContext`, `StateTransitionResult` interfaces |
| `apps/server/src/services/lead-engineer-service.ts`           | Main service wiring processors into state machine                    |

## See Also

- [Auto Mode Service](./auto-mode-service) — schedules features and delegates to `LeadEngineerService`
- [Antagonistic Review](./antagonistic-review) — plan quality gate called from `PlanProcessor`
- [Worktree Recovery Service](./worktree-recovery-service) — post-agent hook in `ExecuteProcessor`
