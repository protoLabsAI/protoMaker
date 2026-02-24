# Reliability & recovery patterns

Production reliability mechanisms that keep the autonomous pipeline healthy. Covers failure classification, model escalation, circuit breakers, health sweeps, escalation routing, PR remediation, trajectory storage, and per-feature reflections.

## Failure classification

When an agent execution fails, `RecoveryService.analyzeFailure()` categorizes the error and determines a recovery strategy.

### Failure categories

| Category         | Examples                                     | Default strategy               |
| ---------------- | -------------------------------------------- | ------------------------------ |
| `transient`      | Network timeout, DNS failure, socket hang up | Retry with exponential backoff |
| `rate_limit`     | API throttle (429), quota warning            | Pause and wait (5s base delay) |
| `quota`          | Monthly usage cap, spending limit            | Escalate to user               |
| `validation`     | Invalid input, schema mismatch               | Escalate to user               |
| `tool_error`     | Bash command failed, file not found          | Alternative approach           |
| `test_failure`   | Unit test failure, build error               | Retry with error context       |
| `merge_conflict` | Git conflict on rebase                       | Escalate to user               |
| `dependency`     | Missing npm package, unresolved import       | Retry with context             |
| `authentication` | API key expired, token revoked               | Escalate to user               |
| `unknown`        | Unclassified error                           | Escalate to user               |

### Recovery strategies

Six strategies, applied based on category:

1. **retry** — Simple retry with delay (transient errors)
2. **retry_with_context** — Retry with previous error output injected into the agent prompt (test failures, dependency issues)
3. **alternative_approach** — Try a different tool or command (tool errors)
4. **rollback_and_retry** — Clear changes, start fresh (corrupted state)
5. **pause_and_wait** — Hold for API recovery (rate limits)
6. **escalate_to_user** — Emit `recovery_escalated` event, stop retrying (terminal)

### Exponential backoff

Transient retries use exponential backoff: `base × 2^retryCount`, capped at `maxDelay`.

| Parameter                | Value     |
| ------------------------ | --------- |
| Base delay               | 1,000 ms  |
| Max delay                | 30,000 ms |
| Max transient retries    | 3         |
| Max test failure retries | 2         |
| Rate limit base delay    | 5,000 ms  |

### Lesson generation

After 3+ failures of the same category for a project, `RecoveryService.checkAndGenerateLessons()` writes a guidance context file to `.automaker/context/failure-lessons-{category}.md`. Future agents automatically receive this guidance via the context loading system.

**Source:** `apps/server/src/services/recovery-service.ts`

## Model auto-escalation

The model tier isn't fixed for a feature's lifetime. The escalation chain:

```
Haiku → Sonnet → Opus → ESCALATE (human)
```

### When escalation triggers

- Feature fails **2+ times** at the current tier
- Test failures persist after retry with context
- Agent hits turn limit without completing

### How it works

`AutoModeService` tracks retry count per feature. On the 3rd failure:

1. Current model tier is noted
2. Next tier is selected (Haiku → Sonnet, Sonnet → Opus)
3. Feature retries with the higher-capability model
4. If Opus also fails → ESCALATE state, human intervention required

This captures the human pattern: "This is harder than I thought, let me think more carefully."

## Circuit breaker

The auto-mode orchestration loop includes a circuit breaker that prevents cascading failures.

### Behavior

| Parameter         | Value                    |
| ----------------- | ------------------------ |
| Failure threshold | 2 failures in 60 seconds |
| Action            | Pause auto-mode          |
| Resume after      | 5 minutes (automatic)    |

When 2 features fail within a 60-second window, auto-mode pauses. This prevents burning API credits on a systemic issue (e.g., API outage, broken build on main).

After 5 minutes, auto-mode resumes automatically. If the issue persists, the circuit breaker trips again.

### Integration

The circuit breaker is evaluated in the auto-mode tick loop, not in the Lead Engineer. The orchestration loop is the scheduler; the state machine is the executor.

## Health sweep

Every ~100 seconds (50 iterations at a 2-second interval), the auto-mode loop runs `FeatureHealthService.audit()` with auto-fix enabled. This catches structural drift on the board.

### Issue types

| Issue type            | Detection                                           | Auto-fix                    |
| --------------------- | --------------------------------------------------- | --------------------------- |
| `orphaned_epic_ref`   | Feature references non-existent or non-epic parent  | Clear `epicId` reference    |
| `dangling_dependency` | Feature depends on deleted features                 | Remove non-existent dep IDs |
| `epic_children_done`  | All child features done, but epic still in-progress | Set epic status to `done`   |
| `stale_running`       | Feature marked `in_progress` with no active agent   | Reset to `backlog`          |
| `stale_gate`          | Feature awaiting pipeline gate for >1 hour          | Move to `blocked`           |
| `merged_not_done`     | Branch merged to main but feature not marked done   | Set status to `done`        |

### How it works

```typescript
const report = await featureHealthService.audit(projectPath, true); // autoFix=true

// report.issues — all detected problems
// report.fixed  — problems that were auto-corrected
```

Each detected issue emits an `escalation:signal-received` event with a deduplication key, so the escalation router can alert without flooding.

### Safety

- Uses `execFileAsync` (not shell) for git operations — prevents injection
- Detects both `main` and `master` as default branches
- Caches epic branch `--merged` results to reduce git calls

**Source:** `apps/server/src/services/feature-health-service.ts`

## Escalation router

When recovery fails or health sweep finds unfixable issues, signals route to notification channels via `EscalationRouter`.

### Signal flow

```
Recovery failure / Health issue / Lead Engineer escalation
    ↓
EscalationRouter.routeSignal(signal)
    ├── Deduplication check (30-min window)
    │   └── Duplicate? → emit 'escalation:signal-deduplicated', skip
    ├── Severity filter
    │   └── Low severity? → log only, no routing
    ├── Per-channel rate limit check
    │   └── Rate limited? → add to rateLimited list, skip channel
    └── Send to matching channels
        └── emit 'escalation:signal-sent' per channel
```

### Signal severity

| Severity   | Behavior                                     |
| ---------- | -------------------------------------------- |
| `low`      | Logged only, not routed to channels          |
| `medium`   | Routed to matching channels                  |
| `high`     | Routed to all matching channels              |
| `critical` | Routed to all channels, bypasses rate limits |

### Deduplication

Signals carry a `deduplicationKey` (e.g., `"escalation:feature-123:test-failure"`). If the same key was seen within the last 30 minutes, the signal is deduplicated — logged but not re-routed.

### Rate limiting

Each channel can define a rate limit:

```typescript
interface EscalationChannel {
  name: string;
  canHandle(signal: EscalationSignal): boolean;
  send(signal: EscalationSignal): Promise<void>;
  rateLimit?: { maxSignals: number; windowMs: number };
}
```

Example: Discord might limit to 5 signals per hour. The router tracks per-channel counters and skips channels that exceed their limit.

### Acknowledgment

Signals can be acknowledged via `acknowledgeSignal(deduplicationKey, acknowledgedBy, notes?, clearDedup?)`. This marks the signal as handled in the escalation log and optionally clears the deduplication window.

### Audit log

The router maintains a log of up to 1,000 entries (most recent first). Each entry records:

- The signal and its severity
- Which channels received it
- Whether it was deduplicated or rate-limited
- Acknowledgment status

**Source:** `apps/server/src/services/escalation-router.ts`

## PR remediation loop

When a PR fails CI or receives review feedback, the system enters a remediation loop.

### Flow

```
PR created → CI runs + CodeRabbit reviews
    ├── CI passes + approved → MERGE
    ├── CI fails → extract failure context → back to EXECUTE
    ├── changes_requested → collect feedback → send to agent for fixes
    └── Max retries exceeded → ESCALATE
```

### Limits

| Parameter             | Value                                    |
| --------------------- | ---------------------------------------- |
| Max CI retry cycles   | 2 (back to EXECUTE with failure context) |
| Max feedback cycles   | 2 (agent addresses reviewer comments)    |
| Max total remediation | 4 cycles before escalation               |
| PR poll interval      | 60 seconds                               |

### How feedback flows

1. `PRFeedbackService` polls GitHub every 60 seconds for new review activity
2. On `changes_requested`: feedback is collected and sent to the agent
3. The agent addresses feedback in the worktree and pushes
4. CI re-runs, CodeRabbit re-reviews
5. On `approved` + CI passing → MERGE

For the full PR remediation reference, see [PR Remediation Loop](../dev/pr-remediation-loop.md).

## Trajectory store

`TrajectoryStoreService` persists verified execution trajectories for learning.

### Storage

```
.automaker/trajectory/{featureId}/attempt-{N}.json
```

Each trajectory records:

- Feature metadata (ID, title, complexity)
- Execution outcome (success/failure)
- Key decisions the agent made
- Recovery strategies that worked
- Failure patterns encountered
- Duration and token usage

### Non-blocking writes

Trajectory writes are fire-and-forget. They never block the agent execution loop. If the write fails (disk full, permissions), the feature still completes normally.

### Sibling reflections

When a feature enters EXECUTE, the Lead Engineer loads trajectories from recently completed sibling features:

```typescript
const siblings = features
  .filter((f) => f.status === 'verified' && f.lastExecutionTime)
  .sort((a, b) => (b.lastExecutionTime || 0) - (a.lastExecutionTime || 0))
  .slice(0, 3); // max 3 reflections
```

**Sibling matching:** Same `epicId` (if in an epic) or same `projectSlug` (if standalone).

These reflections are injected into the agent's context as "Lessons from Similar Features" (max ~500 tokens), giving each agent the benefit of what prior agents learned.

**Source:** `apps/server/src/services/trajectory-store-service.ts`

## Per-feature reflection loop

After each feature reaches DONE, a lightweight reflection is generated.

### How it works

1. `DeployProcessor.generateReflection()` fires non-blocking after marking a feature done
2. Reads the tail of `agent-output.md` (last 2,000 chars) plus execution metadata
3. Calls `simpleQuery()` with Haiku (maxTurns: 1, no tools) to produce a structured reflection under 200 words
4. Writes result to `.automaker/features/{id}/reflection.md`
5. Emits `feature:reflection:complete` event

### Feed-forward

Reflections from completed siblings are loaded during EXECUTE (see Trajectory Store above). This creates an in-project learning loop — each feature benefits from the last.

### Cost

~$0.001 per reflection (Haiku, single turn, no tools). Fire-and-forget — failure does not block the state machine.

### Observability

Reflection LLM calls are traced in Langfuse with:

- Tags: `feature:{id}`, `role:reflection`
- Metadata: `featureId`, `featureName`, `agentRole: 'reflection'`

## FailureClassifierService

Pattern-matches escalation reason strings to structured failure categories and recovery strategies.

### Purpose

When the Lead Engineer's ESCALATE state receives an escalation reason string (e.g., "Rate limit exceeded", "Tests failed after 3 retries"), the classifier maps it to a `FailureCategory` and suggests a `RecoveryStrategy`.

### Integration

Called by `EscalateProcessor.process()` in the Lead Engineer state machine. The classified category determines:

- Whether to retry or escalate
- Which model tier to use on retry
- What context to inject into the agent prompt

**Source:** `apps/server/src/services/failure-classifier-service.ts`

## Event-driven observability

All reliability services emit events for real-time UI updates and audit logging:

| Service              | Event prefix    | Key events                                                                      |
| -------------------- | --------------- | ------------------------------------------------------------------------------- |
| RecoveryService      | `recovery_*`    | `analysis`, `started`, `completed`, `recorded`, `escalated`, `lesson_generated` |
| EscalationRouter     | `escalation:*`  | `signal-received`, `deduplicated`, `sent`, `failed`, `routed`, `acknowledged`   |
| FeatureHealthService | (via auto-mode) | Issues surface through escalation events                                        |
| Lead Engineer        | `feature:*`     | `reflection:complete`, `pr-merged`, `state-changed`                             |

## Recovery architecture diagram

```
Feature Execution Fails
    ↓
RecoveryService.analyzeFailure()
    ├── categorizeFailure() → FailureCategory
    ├── determineStrategy() → RecoveryStrategy
    ├── recordRecoveryAttempt() → JSONL log + emit events
    └── checkAndGenerateLessons() (after 3+ failures)
        └── Write failure-lessons-{category}.md to context/
    ↓
Recovery result: { success, shouldRetry, actionTaken }
    ├── If retryable → AutoModeService.retry() with injected context
    └── If escalate → EscalationRouter.routeSignal()
        ├── Dedup check (30-min window)
        ├── Rate limit check (per-channel)
        └── Send to registered channels
            └── EscalationLogEntry recorded for audit trail
    ↓
(Parallel) FeatureHealthService.audit()
    └── Check for drift: orphaned refs, stale running, merged branches
    └── Auto-fix if enabled → Update feature status
    ↓
Lead Engineer State Machine
    ├── [EXECUTE] Load sibling reflections from trajectory store
    ├── [REMEDIATION] Inject failure context + review feedback
    └── [ESCALATE] FailureClassifierService maps reason → category
```

## Related documentation

- [Agent Philosophy](./philosophy.md) — Why the system is designed this way
- [PR Remediation Loop](../dev/pr-remediation-loop.md) — Detailed CI failure handling
- [Engine Architecture](../archived/engine-architecture.md) — Lead Engineer state machine ADR
- [Idea to Production](../dev/idea-to-production.md) — Full pipeline with escalation points
- [Langfuse Integration](../dev/langfuse-integration.md) — Tracing and cost tracking
