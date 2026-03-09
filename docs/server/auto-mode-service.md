# Auto Mode Service

Autonomous feature implementation engine that drives agent execution, worktree lifecycle, concurrency, and the auto-loop for multi-project builds.

## Overview

`AutoModeService` is the central coordinator for AI-driven feature development. It:

- **Schedules features** — picks the next backlog item and dispatches it to an agent
- **Manages worktrees** — creates isolated git worktrees per feature for parallel execution
- **Controls concurrency** — enforces max concurrent agents with a `ConcurrencyManager`
- **Runs auto-loops** — continuous execution loops per project/worktree pair
- **Handles failures** — circuit breaker pauses the loop after consecutive failures, auto-resumes after cooldown
- **Manages memory** — monitors heap usage and blocks/aborts agents when thresholds are breached

## Architecture

```text
AutoModeService
  ├── FeatureScheduler      — loop ownership, feature loading, dispatch
  ├── ExecutionService      — per-feature execution logic (plan, build, verify, merge)
  ├── ConcurrencyManager    — concurrency slot tracking across all projects
  ├── AutoLoopCoordinator   — per-worktree loop state (running, paused, failures)
  ├── FeatureStateManager   — persist-before-emit status transitions
  └── TypedEventBus         — type-safe event emission
```

### Feature Execution Flow

```text
startAutoLoop()
  --> FeatureScheduler.loop()
    --> Load next backlog feature
    --> ConcurrencyManager: acquire slot
    --> ExecutionService.executeFeature()
          --> createWorktreeForBranch()
          --> Build prompt with context files + images
          --> Claude Agent SDK invocation (via LeadEngineerService)
          --> StreamObserver: detect agent loops
          --> On success: gitWorkflowService.merge()
          --> On failure: trackFailure() → circuit breaker check
    --> Release concurrency slot
    --> Emit feature:status-changed
```

## Key Components

### FeatureScheduler

Owns the auto-loop tick. Each iteration:

1. Checks if auto-mode is still running
2. Loads backlog features respecting dependency order
3. Filters blocked features (human-assigned deps, pipeline gates)
4. Dispatches to `ExecutionService`

### ExecutionService

Handles all per-feature execution logic:

- Worktree creation/reuse
- Prompt assembly (`buildPromptWithImages`, context file loading)
- Claude Agent SDK invocation with MCP servers
- `StreamObserver` integration for loop detection
- Plan approval gating (when `planningMode` is enabled)
- Retry on `LoopDetectedError` with recovery guidance

### ConcurrencyManager

Controls how many agents run simultaneously. Slot-based approach:

- Slots are claimed synchronously before any async work
- Released on completion (success or failure)
- Separate from per-project concurrency — global cap is `MAX_SYSTEM_CONCURRENCY`

### AutoLoopCoordinator

Per-worktree loop state (key: `projectPath::branchName`):

```typescript
interface ProjectAutoLoopState {
  abortController: AbortController;
  isRunning: boolean;
  consecutiveFailures: { timestamp: number; error: string }[];
  pausedDueToFailures: boolean;
  humanBlockedCount: number;
  cooldownTimer: NodeJS.Timeout | null;
}
```

### Circuit Breaker

After `CONSECUTIVE_FAILURE_THRESHOLD` (2) failures within `FAILURE_WINDOW_MS` (60s), the loop pauses for `COOLDOWN_PERIOD_MS` (5 minutes), then auto-resumes.

### Memory Management

Heap usage is checked before starting new agents:

| Threshold | Env Var                | Default | Behavior               |
| --------- | ---------------------- | ------- | ---------------------- |
| Stop      | `HEAP_STOP_THRESHOLD`  | `0.80`  | Block new agent starts |
| Abort     | `HEAP_ABORT_THRESHOLD` | `0.90`  | Abort running agents   |

## LoopDetectedError

`StreamObserver` monitors agent output for repeated patterns. When a loop is detected, it throws `LoopDetectedError` with the `loopSignature`. `ExecutionService` catches this and retries once with recovery guidance injected into the prompt.

```typescript
export class LoopDetectedError extends Error {
  readonly loopSignature: string;
}
```

## Execution State Persistence

Before executing, the service persists `ExecutionState` to disk (`.automaker/execution-state.json`). On server restart, interrupted features are detected and resumed.

```typescript
interface ExecutionState {
  version: 1;
  autoLoopWasRunning: boolean;
  maxConcurrency: number;
  projectPath: string;
  branchName: string | null;
  runningFeatureIds: string[];
  savedAt: string; // ISO-8601
}
```

Call `resumeInterruptedFeatures(projectPath)` on startup to re-queue any `in-progress` features that survived a crash.

## Multi-Project Support

Auto-loops are keyed by `projectPath::branchName`. Multiple projects can run loops simultaneously. The key function:

```typescript
function getWorktreeAutoLoopKey(projectPath: string, branchName: string | null): string {
  const normalizedBranch = branchName === 'main' ? null : branchName;
  return `${projectPath}::${normalizedBranch ?? '__main__'}`;
}
```

`startAutoLoopForProject(projectPath, branchName, config)` starts a loop for a specific worktree. `stopAutoLoopForProject(key)` stops it.

## Configuration

```typescript
interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
  branchName: string | null; // null = main worktree
}
```

Settings read from `workflowSettings` in `.automaker/settings.json`:

| Setting               | Description                                  |
| --------------------- | -------------------------------------------- |
| `agentExecutionModel` | Primary model for agent execution            |
| `maxConcurrency`      | Max parallel agents (capped at system limit) |
| `useWorktrees`        | Enable per-feature git worktrees             |
| `autoLoadClaudeMd`    | Auto-inject CLAUDE.md into agent context     |
| `mcpServers`          | MCP server config passed to Claude SDK       |
| `planningMode`        | Enable plan approval gating                  |

## Prometheus Metrics

| Metric                      | Type      | Description                             |
| --------------------------- | --------- | --------------------------------------- |
| `agent_cost_total`          | Counter   | Cumulative cost (USD) across all agents |
| `agent_execution_duration`  | Histogram | Feature execution time (seconds)        |
| `active_agents_count`       | Gauge     | Currently running agents                |
| `agent_tokens_input_total`  | Counter   | Total input tokens consumed             |
| `agent_tokens_output_total` | Counter   | Total output tokens generated           |
| `agent_executions_total`    | Counter   | Total feature executions                |

## Key Files

| File                                                          | Role                                             |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `apps/server/src/services/auto-mode-service.ts`               | Core service — loop orchestration and public API |
| `apps/server/src/services/auto-mode/execution-service.ts`     | Per-feature execution logic                      |
| `apps/server/src/services/auto-mode/concurrency-manager.ts`   | Concurrency slot management                      |
| `apps/server/src/services/auto-mode/auto-loop-coordinator.ts` | Per-worktree loop state                          |
| `apps/server/src/services/auto-mode/feature-state-manager.ts` | Persist-before-emit status transitions           |
| `apps/server/src/services/auto-mode/typed-event-bus.ts`       | Type-safe event wrappers                         |
| `apps/server/src/services/feature-scheduler.ts`               | Loop tick and feature dispatch                   |
| `apps/server/src/services/lead-engineer-service.ts`           | Claude Agent SDK invocation                      |
| `apps/server/src/services/stream-observer-service.ts`         | Agent output monitoring (loop detection)         |
| `apps/server/src/services/recovery-service.ts`                | Crash recovery and resume logic                  |

## See Also

- [Ava Channel Reactor](./ava-channel-reactor) — fleet coordination and work distribution
- [Work Intake Service](./work-intake-service) — pull-based phase claiming from shared projects
- [DORA Metrics](./dora-metrics) — lead time and deployment frequency tracking
