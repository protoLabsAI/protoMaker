# Research Report: Pipeline Autonomy Hardening

Generated: 2026-03-14T19:17:06.837Z
Sub-topics investigated: 5
Total citations: 64
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

# Pipeline Autonomy Hardening — Comprehensive Research Report

## Summary

The Pipeline Autonomy Hardening project targets 86 audit findings across the Lead Engineer auto-mode pipeline, spanning five domains: **security** (shell/GraphQL injection), **state machine correctness** (missing processors, logging bugs, transition budget exhaustion), **concurrency** (in-memory deduplication races, recursive timeouts), **error handling** (silent catch blocks, no DLQ), and **test coverage** (three zero-coverage services totaling ~2,379 lines). The pipeline's architecture is a processor-per-state machine (`FeatureStateMachine`) orchestrated by a `PipelineOrchestrator`, with auto-mode coordination handled by `FeatureScheduler`, `AutoLoopCoordinator`, and `ConcurrencyManager`. While the system already implements multi-layered self-healing (circuit breakers [41], bounded retry [44], stale-lease eviction [27], memory-pressure abort [34], health monitoring [46]), critical gaps remain: **four shell/GraphQL injection vectors** [14][15][16][17][18][19], a **missing DONE state processor** causing invalid transitions on resume [3], an **infinite recursion bug** in worktree-lock timeout handling [11], and a **tight transition budget** that forces premature escalation under normal remediation load [8]. Fixing these 86 findings requires coordinated changes across ~15 service files, with each fix phase constrained to 30–60 minutes and gated by `npm run test:server` + `npm run typecheck` [64].

---

## Codebase Findings

### 1. State Machine Correctness

#### 1.1 Dual Type System Divergence

Two parallel representations define the same processing states: a `FeatureProcessingState` string union in the server package [1] and a `FeatureState` enum in the shared types library [2]. This divergence risks silent type mismatches at module boundaries where one representation is used where the other is expected. A canonical single source of truth is needed.

#### 1.2 Missing DONE Processor

The `FeatureStateMachine` constructor registers processors for seven states but omits `DONE` [3]:

```typescript
// /home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:111-118
this.processors = new Map<FeatureProcessingState, StateProcessor>();
this.processors.set('INTAKE', new IntakeProcessor(serviceContext));
this.processors.set('PLAN', new PlanProcessor(serviceContext));
this.processors.set('EXECUTE', new ExecuteProcessor(serviceContext));
this.processors.set('REVIEW', new ReviewProcessor(serviceContext));
this.processors.set('MERGE', new MergeProcessor(serviceContext));
this.processors.set('DEPLOY', new DeployProcessor(serviceContext));
this.processors.set('ESCALATE', new EscalateProcessor(serviceContext));
// ⚠️ 'DONE' is NEVER registered
```

When a feature resumes in `DONE` state, the missing processor triggers the overflow handler, forcing an invalid `DONE→ESCALATE` transition [3].

#### 1.3 Terminal State Logging Bug

When `result.nextState === null` (terminal completion), the log emits `finalState: currentState`, which still holds the **previous** state rather than a meaningful terminal indicator [4]:

```typescript
// /home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:295-306
if (!result.shouldContinue || !result.nextState) {
  if (result.nextState) {
    currentState = result.nextState;
  }
  logger.info('Feature processing completed', {
    featureId: feature.id,
    finalState: currentState, // ⚠️ Still holds PREVIOUS state when nextState is null
    transitionCount,
  });
  break;
}
```

This breaks observability for any monitoring system that relies on `finalState` to determine completion status.

#### 1.4 External Merge Bypasses Terminal Flow

When the REVIEW processor detects an externally merged PR, it sets status to `done` and returns `nextState: null` [6]:

```typescript
// /home/josh/dev/ava/apps/server/src/services/lead-engineer-review-merge-processors.ts:88-109
if (externallyMerged) {
  await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
    status: 'done',
  });
  return {
    nextState: null, // ⚠️ Skips MERGE, DEPLOY, goal-verification, trajectory recording
    shouldContinue: false,
    reason: 'PR merged externally via branch detection',
  };
}
```

This bypasses MERGE, DEPLOY, goal-verification, and trajectory recording—degrading both operational completeness and the training data pipeline.

#### 1.5 Transition Budget Exhaustion

The budget constants create a tight squeeze [7][8]:

```typescript
// /home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:150-156
let transitionCount = 0;
const MAX_TRANSITIONS = 20; // ⚠️ Tight: normal remediation uses ~14-20 slots
let sameStateCount = 0;
const MAX_SAME_STATE_TRANSITIONS = 100; // ⚠️ Generous: allows ~50 min of REVIEW polling
```

A nominal happy path consumes 6 transitions (INTAKE→PLAN→EXECUTE→REVIEW→MERGE→DEPLOY→DONE). With `MAX_TOTAL_REMEDIATION_CYCLES = 4` [5], each cycle adding ~3–4 transitions, normal remediation reaches 14–20 transitions—exactly at the `MAX_TRANSITIONS = 20` limit. Any additional retry forces ESCALATE [8]. Meanwhile, `MAX_SAME_STATE_TRANSITIONS = 100` with ~30s REVIEW polling delays allows ~50 minutes of effectively idle polling before escalation [7].

#### 1.6 REVIEW→EXECUTE Remediation Guard Gap

The secondary iteration-count guard (`trackedPR.iterationCount >= MAX_PR_ITERATIONS`) is silently skipped if `PRFeedbackService` is undefined [5], allowing unbounded remediation loops when that service is unavailable.

#### 1.7 Hardcoded Gate Phase Overrides

`evaluateGate()` overrides the `review` gate mode for `SPEC_REVIEW` and `VERIFY` to always return `'hold'`, ignoring user configuration [12]:

```typescript
// /home/josh/dev/ava/apps/server/src/services/pipeline-orchestrator.ts:829-846
private async evaluateGate(gateMode: GateMode, featureId: string, phase: PipelinePhase) {
  if (gateMode === 'auto') return 'proceed';
  if (gateMode === 'manual') return 'hold';
  if (phase === 'SPEC_REVIEW') return 'hold';
  if (phase === 'VERIFY') return 'hold';
  return 'proceed';
}
```

For a "zero human intervention" pipeline, these hardcoded holds directly contradict the autonomy goal.

#### 1.8 Unmapped Pipeline Events

`EVENT_PHASE_MAP` in the `PipelineOrchestrator` has no fallback for unmapped events [9]. Unmapped events are silently ignored, causing stalled pipeline state with no error signal or log entry.

#### 1.9 Ceremony State Machine Blindness

The ceremony state machine's `transition()` function silently returns unchanged state for unrecognized event/phase combinations [13], with no logging. Ceremony processing stalls become invisible to operators.

---

### 2. Security Vulnerabilities

#### 2.1 CRITICAL — Shell Injection via Epic Title

`epic.title` is directly interpolated into a shell command [14]:

```typescript
// FILE: apps/server/src/services/completion-detector-service.ts:373-375
const { stdout: prOutput } = await execAsync(
  `gh pr create --base ${baseBranch} --head ${epicBranch} --title "epic: ${epic.title}" --body "${body.replace(/"/g, '\\"')}"`,
  { cwd: projectPath, timeout: 30000 }
);
```

A crafted title like `"; gh pr merge 999 --admin; echo "` executes arbitrary commands. The `body` escaping only handles double quotes, leaving `$()`, backticks, and other shell metacharacters unguarded.

#### 2.2 CRITICAL — GraphQL Injection via Repository Name

Three services interpolate `owner` and `repoName` from git remote URLs directly into GraphQL queries [15][16][17]:

```typescript
// FILE: apps/server/src/services/coderabbit-resolver-service.ts:152-154
const query = `
  query {
    repository(owner: "${owner}", name: "${repoName}") {
```

A malicious git remote URL could inject arbitrary GraphQL operations. The same pattern appears in `git-workflow-service.ts` [16] and `pr-status-checker.ts` [17].

#### 2.3 CRITICAL — Incomplete GraphQL String Escaping

The `coderabbit-resolver-service.ts` escapes only `"` and `\n` in GraphQL string values [18]:

```typescript
// FILE: apps/server/src/services/coderabbit-resolver-service.ts:259-263
pullRequestReviewThreadId: "${threadId}",
body: "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
```

Backslashes (`\`), tabs, carriage returns, and unicode escape sequences remain unguarded—any of these can break out of the string context.

#### 2.4 CRITICAL — Shell Injection via Event Hooks

`substituteVariables()` performs bare regex replacement with no shell escaping [19]:

```typescript
// FILE: apps/server/src/services/event-hook-service.ts:888-896
private substituteVariables(template: string, context: HookContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    return String(value);   // ← NO shell escaping whatsoever
  });
}
```

Context values containing shell metacharacters (`$`, `;`, `|`, backticks) are passed directly to `execAsync()` [19].

#### 2.5 HIGH — Inconsistent Branch Name Validation

A regex guard `/^[a-zA-Z0-9._\-/]+$/` exists in `lead-engineer-review-merge-processors.ts` [20] but is absent from `git-workflow-service.ts` and other shell command callers. This inconsistency leaves multiple injection surfaces unprotected.

#### 2.6 MEDIUM — Missing Startup Secret Validation

Seven sensitive API keys (`GH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CURSOR_API_KEY`, `DISCORD_TOKEN`, `LANGFUSE_SECRET_KEY`, `SENTRY_AUTH_TOKEN`) lack startup-time presence or format validation [21]. Missing keys cause runtime failures deep in execution rather than fast-failing at startup.

#### 2.7 LOW-MEDIUM — YAML Deserialization Risk

`yaml: ^2.8.1` is a dependency [22]. If `yaml.load()` is called on untrusted content (instead of the safe `yaml.parse()`), deserialization injection is possible.

---

### 3. Concurrency & Race Conditions

#### 3.1 In-Memory Deduplication Race

Feature deduplication uses a per-instance in-memory `Set` [10][23][24]:

```typescript
// FILE: apps/server/src/services/feature-scheduler.ts:403-404
projectState.startingFeatures.add(nextFeature.id); // ⚠️ Per-instance only, not distributed
```

In multi-process deployments, two instances can simultaneously claim the same feature, launching duplicate agents.

#### 3.2 TOCTOU Race Prevention

The `pendingLoopStarts` set is populated synchronously before any `await` [25], preventing two callers in the same event-loop tick from bypassing the guard:

```typescript
// FILE: apps/server/src/services/auto-mode-service.ts:203
this.pendingLoopStarts.add(worktreeKey);
```

This is a correct pattern for single-process deployments.

#### 3.3 Infinite Recursion in Worktree-Lock Timeout

If a lock file persists (e.g., crashed agent), `scheduleStartingTimeout()` recursively re-schedules itself indefinitely [11]:

```typescript
// FILE: apps/server/src/services/feature-scheduler.ts:435-456
if (locked) {
  scheduleStartingTimeout(STARTING_TIMEOUT_MS); // ⚠️ Recursive — never terminates if lock persists
} else {
  projectState.startingFeatures.delete(featureForTimeout.id);
}
```

This permanently consumes a concurrency slot, as documented in the project's own gotchas [36]. The timeout must enforce a maximum retry count or absolute deadline.

#### 3.4 Lease-Based Concurrency with Re-entrance

The `ConcurrencyManager` uses reference-counted leases [26], avoiding deadlock in resumption chains:

```typescript
// FILE: apps/server/src/services/auto-mode/concurrency-manager.ts:38
acquire(featureId, ...): boolean {
  const existing = this.leases.get(featureId);
  if (existing) { existing.leaseCount++; return false; }
  this.leases.set(featureId, { ..., leaseCount: 1, startTime: Date.now() });
  return true;
}
```

Stale lease eviction [27] provides self-healing for crashed executors. The double-cleanup race between legitimate completion and timeout firing is a documented gotcha [36].

#### 3.5 Circuit Breaker — Rolling Failure Window

The auto-loop coordinator tracks failures in a 60-second rolling window, pausing after 3 failures [31]:

```typescript
// FILE: apps/server/src/services/auto-mode/auto-loop-coordinator.ts:261
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;
state.failureTimestamps = state.failureTimestamps.filter((ts) => now - ts < FAILURE_WINDOW_MS);
if (state.failureTimestamps.length >= FAILURE_THRESHOLD) return true;
```

#### 3.6 Memory-Pressure Self-Healing

A 30-second heartbeat checks heap usage; exceeding the abort threshold triggers `AbortController.abort()` [34][30]:

```typescript
// FILE: apps/server/src/services/auto-mode/execution-service.ts:2341
const memoryHeartbeat = setInterval(() => {
  const heapUsage = this.getHeapUsagePercent();
  if (heapUsage >= this.heapAbortThreshold) abortController.abort();
}, 30_000);
```

#### 3.7 Reactive Spawner Budget Controls

Per-category `maxConcurrent=1` prevents overlapping self-healing runs; hash-set dedup with 1-hour TTL and per-category circuit breaker (`failureThreshold=3`, `cooldownMs=300000`) prevent cascading failures [35].

---

### 4. Error Handling & Self-Healing

#### 4.1 Existing Infrastructure

The system implements **six layers** of error handling:

| Layer                | Component                                                                   | Citation |
| -------------------- | --------------------------------------------------------------------------- | -------- |
| Circuit Breaker      | `circuit-breaker.ts` — opens after threshold, auto-resets after cooldown    | [41]     |
| Error Classification | `error-handler.ts` (server + libs) — typed categories with `retryable` flag | [42][43] |
| Bounded Retry        | `api-client.ts` — 3 attempts, `[1s, 2s, 4s]` backoff + provider offsets     | [44]     |
| Timeout Enforcement  | `timeout-enforcer.ts` — races operations, propagates `AbortSignal`          | [45]     |
| Health Monitor       | `health-monitor-service.ts` — periodic scans, auto-remediation              | [46]     |
| Recovery Service     | `recovery-service.ts` — 6 strategies, JSONL persistence                     | [47]     |

**Recovery strategies** [47]:

```typescript
switch (strategy.type) {
  case 'retry':                  result = await this.executeRetry(...); break;
  case 'retry_with_context':     result = await this.executeRetryWithContext(...); break;
  case 'alternative_approach':   result = await this.executeAlternativeApproach(...); break;
  case 'rollback_and_retry':     result = await this.executeRollbackAndRetry(...); break;
  case 'pause_and_wait':         result = await this.executePauseAndWait(...); break;
  case 'escalate_to_user':       result = await this.executeEscalateToUser(...); break;
}
```

#### 4.2 Post-Agent Safety Net

The post-execution middleware [49] and worktree recovery service [48] run on every agent exit: formatting, staging, committing (`--no-verify`), rebasing, pushing, creating PRs with auto-merge, and scanning for nested worktrees. Silent catch blocks are documented with `logger.error` [51]:

```typescript
// FILE: apps/server/src/services/auto-mode/post-execution-middleware.ts:173
} catch (recoveryError) {
  logger.error(
    `[PostExecution] ${featureId}: uncommitted work check threw unexpectedly:`,
    recoveryError
  );
}
```

#### 4.3 Process-Level Crash Guards

`unhandledRejection` logs and continues; `uncaughtException` distinguishes fatal vs. non-fatal (`ECONNRESET`, `EPIPE`, `ERR_STREAM_DESTROYED`) [50].

#### 4.4 Gaps

- **No alerting integration**: No webhook, PagerDuty, or Slack notification for ESCALATE or critical health states [46].
- **No dead-letter queue**: Failure persistence is via JSONL and in-process state only—no message-queue-backed DLQ [47].

---

### 5. Test Coverage

#### 5.1 Current State

Server coverage thresholds: lines 60%, functions 75%, branches 55%, statements 60% [54]. Routes, middleware, `claude-usage-service.ts`, and `mcp-test-service.ts` are excluded [55].

Three services have **zero test coverage** (~2,379 lines total) [56][57][58]:

- `git-workflow-service.ts` — 1,660 lines
- `stream-observer-service.ts` — 248 lines
- `coderabbit-resolver-service.ts` — 471 lines

Retry logic in `git-workflow-service.ts` (lines 41–73) and loop/stall detection in `stream-observer-service.ts` (lines 187–227) are completely untested [56][57].

#### 5.2 CI Pipeline

CI runs `npm run test:packages` and `npm run test:server:coverage` on PRs/pushes to main/staging/dev [59]. **Codecov integration is commented out**, disabling trend tracking and PR coverage gating [60].

#### 5.3 Test Infrastructure

Test setup [62]:

```typescript
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@protolabsai/git-utils', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, rebaseWorktreeOnMain: vi.fn(async () => ({ success: true })) };
});
```

Factory helpers (`makeCtx`, `makeFeature`, `makeEvents`) construct test data [63]. Filesystem mocking uses temp directories with cleanup.

#### 5.4 Milestone 5 Plan

Four test suites planned [61]: `git-workflow-service.test.ts` (15+ cases), `stream-observer-service.test.ts` (10+ cases), `coderabbit-resolver-service.test.ts` (10+ cases), `lead-engineer-regression.test.ts` (8+ cases covering audit findings). Each fix phase is constrained to 30–60 minutes, gated by `npm run test:server` + `npm run typecheck` [64].

---

## Relevant Patterns & Integration Points

### State Machine ↔ Security Boundary

The state machine's REVIEW processor invokes `git-workflow-service.ts` which contains GraphQL injection vulnerabilities [16]. Any fix to the GraphQL injection must be coordinated with the REVIEW and MERGE processor tests to ensure no regressions in the state transition flow.

### Concurrency ↔ State Machine Interaction

The `ConcurrencyManager` lease system [26] interacts with the state machine's transition budget [8]. If a stale lease eviction [27] triggers a feature re-start, the resumed feature enters the state machine at its persisted state. Without a DONE processor [3], features that completed but weren't cleaned from leases will escalate on resume.

### Error Handling ↔ Self-Healing Loop

The `HealthMonitorService` [46] detects stuck features and invokes remediation (reset-to-backlog, retry, cleanup). This interacts with the `FeatureScheduler`'s `startingFeatures` set [23]—if a feature is reset to backlog while still in `startingFeatures`, the scheduler may refuse to re-schedule it. The double-cleanup gotcha [36] directly applies here.

### Event Hooks ↔ Security

The `substituteVariables()` injection [19] is triggered by the `Promise.allSettled` hook execution pattern [32]. Since hooks run in parallel with error isolation, a single injected hook won't crash the pipeline but **will** execute arbitrary commands silently.

### Persist-Before-Emit Ordering

State updates follow a strict persist-then-emit pattern [37], ensuring subscribers never see uncommitted state. This pattern must be preserved in any state machine fixes.

---

## External Research

No external web research was conducted for this report. All findings are derived from codebase analysis across 64 source files. Relevant industry patterns referenced implicitly include:

- **OWASP Command Injection** — Findings 2.1 and 2.4 are textbook OS command injection (CWE-78).
- **OWASP Injection** — Findings 2.2 and 2.3 are GraphQL injection variants of CWE-89.
- **State Machine Theory** — The missing DONE processor violates the totality requirement (every state must have a defined transition for every valid input).
- **Distributed Systems** — The in-memory deduplication race [10] is a classic single-node assumption failure in horizontally-scaled deployments.

---

## Recommended Approach

### Phase 1: Critical Security (Immediate)

| #   | Finding                             | Fix                                                                                                     | Files                                                                               |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| S1  | Shell injection via epic title [14] | Replace `execAsync` string interpolation with `execFile` array args or `shell-escape`                   | `completion-detector-service.ts`                                                    |
| S2  | GraphQL injection [15][16][17]      | Parameterize queries or apply strict allowlist validation (`/^[a-zA-Z0-9._-]+$/`) on `owner`/`repoName` | `coderabbit-resolver-service.ts`, `git-workflow-service.ts`, `pr-status-checker.ts` |
| S3  | Incomplete GraphQL escaping [18]    | Implement full GraphQL string escaping (backslash, tab, CR, unicode) or use parameterized mutations     | `coderabbit-resolver-service.ts`                                                    |
| S4  | Hook variable injection [19]        | Shell-escape all substituted values using `shell-quote` or equivalent                                   | `event-hook-service.ts`                                                             |
| S5  | Branch name validation [20]         | Extract existing regex guard into shared `validateBranchName()`, apply at all shell-command call sites  | `git-workflow-service.ts`, shared util                                              |

### Phase 2: State Machine Correctness

| #   | Finding                       | Fix                                                                                             | Files                                      |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| M1  | Missing DONE processor [3]    | Register a no-op `DoneProcessor` that returns `{ shouldContinue: false, nextState: null }`      | `lead-engineer-state-machine.ts`           |
| M2  | Terminal state logging [4]    | Set `currentState = 'DONE'` (or `result.nextState`) before logging when nextState is null       | `lead-engineer-state-machine.ts`           |
| M3  | External merge bypass [6]     | Route externally merged PRs through MERGE→DEPLOY (or a fast-path that still records trajectory) | `lead-engineer-review-merge-processors.ts` |
| M4  | Transition budget [7][8]      | Increase `MAX_TRANSITIONS` to 30; decrease `MAX_SAME_STATE_TRANSITIONS` to 20                   | `lead-engineer-state-machine.ts`           |
| M5  | Remediation guard gap [5]     | Add null-check for `PRFeedbackService`; default to max-iterations-exceeded when undefined       | `lead-engineer-review-merge-processors.ts` |
| M6  | Hardcoded gate overrides [12] | Make phase overrides configurable; for `auto` gate mode, remove `SPEC_REVIEW`/`VERIFY` holds    | `pipeline-orchestrator.ts`                 |
| M7  | Unmapped events [9]           | Add fallback with `logger.warn` for unmapped events; optionally emit an event for monitoring    | `pipeline-orchestrator.ts`                 |
| M8  | Ceremony blindness [13]       | Add `logger.warn` for unrecognized event/phase combinations                                     | `ceremony-state-machine.ts`                |

### Phase 3: Concurrency Fixes

| #   | Finding                   | Fix                                                                                                      | Files                  |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| C1  | In-memory dedup race [10] | Add file-system-based lock (or Redis if available) for cross-process deduplication                       | `feature-scheduler.ts` |
| C2  | Infinite recursion [11]   | Add `maxRetries` counter (e.g., 5) to `scheduleStartingTimeout`; force cleanup + log.error on exhaustion | `feature-scheduler.ts` |

### Phase 4: Error Handling Gaps

| #   | Finding                | Fix                                                                     | Files                                          |
| --- | ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| E1  | No alerting            | Add webhook/Discord notification on ESCALATE and health-critical states | `health-monitor-service.ts`, new alerting util |
| E2  | Secret validation [21] | Add startup-time validation for required env vars with format checks    | `server/src/config.ts` or entry point          |

### Phase 5: Test Coverage [61]

- `git-workflow-service.test.ts` — 15+ cases covering retry logic, GraphQL queries post-fix, branch validation
- `stream-observer-service.test.ts` — 10+ cases covering loop/stall detection
- `coderabbit-resolver-service.test.ts` — 10+ cases covering escaping, error paths
- `lead-engineer-regression.test.ts` — 8+ cases covering DONE resume, external merge flow, transition budget edge cases, remediation guard gap
- **Re-enable Codecov** integration [60] for trend tracking

Each fix phase: 30–60 minutes, `npm run test:server` + `npm run typecheck` must pass [64].

---

## Open Questions & Risks

1. **Multi-process deployment reality**: Is the system currently deployed as a single process, or is horizontal scaling imminent? If single-process, the in-memory deduplication race [10] is theoretical. If multi-process, a distributed lock is mandatory.

2. **Transition budget tuning**: Increasing `MAX_TRANSITIONS` from 20 to 30 [8] creates headroom but also allows longer-running features. What is the acceptable upper bound for feature processing time before escalation is genuinely warranted?

3. **External merge trajectory gap**: Should externally merged PRs [6] go through a lightweight DEPLOY/verification flow, or is a separate "external completion" path acceptable? The answer affects trajectory recording completeness.

4. **Gate override intent**: Are the hardcoded `SPEC_REVIEW`/`VERIFY` holds [12] intentional safety guards that should be preserved in non-auto modes, or are they temporary development artifacts? Removing them for `auto` mode is safe, but the `review` mode behavior needs product input.

5. **YAML attack surface**: Is `yaml.load()` actually called anywhere on untrusted input [22]? If only used for configuration files, the risk is low. If used on user-supplied YAML (e.g., spec files), the risk is medium.

6. **Codecov re-enablement**: The commented-out Codecov integration [60] means coverage regressions are invisible in PRs. Re-enabling it before the test coverage phase would provide gating for all subsequent changes.

7. **Alerting integration choice**: The system has no alerting [46]. Discord is already a dependency (`DISCORD_TOKEN` in env [21])—is this the preferred channel, or should a webhook/PagerDuty integration be added?

8. **Post-execution `--no-verify` commits**: The post-execution middleware commits with `--no-verify` [49]. If pre-commit hooks enforce security scanning or formatting, this bypass may introduce unscanned code.

---

## Citations

| #    | Source                                                                                     | Summary                                        |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [1]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-types.ts:105`                   | `FeatureProcessingState` string union type     |
| [2]  | `/home/josh/dev/ava/libs/types/src/lead-engineer.ts:303`                                   | `FeatureState` enum (parallel representation)  |
| [3]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:111`           | Processor registration missing DONE            |
| [4]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:295`           | Terminal state logging bug                     |
| [5]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-review-merge-processors.ts:181` | REVIEW→EXECUTE remediation guard gap           |
| [6]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-review-merge-processors.ts:88`  | External merge bypasses terminal flow          |
| [7]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:152`           | MAX_SAME_STATE_TRANSITIONS = 100               |
| [8]  | `/home/josh/dev/ava/apps/server/src/services/lead-engineer-state-machine.ts:150`           | MAX_TRANSITIONS = 20 budget exhaustion         |
| [9]  | `/home/josh/dev/ava/apps/server/src/services/pipeline-orchestrator.ts:37`                  | EVENT_PHASE_MAP no fallback                    |
| [10] | `/home/josh/dev/ava/apps/server/src/services/feature-scheduler.ts:403`                     | Per-instance in-memory deduplication race      |
| [11] | `/home/josh/dev/ava/apps/server/src/services/feature-scheduler.ts:435`                     | Infinite recursion in worktree-lock timeout    |
| [12] | `/home/josh/dev/ava/apps/server/src/services/pipeline-orchestrator.ts:829`                 | Hardcoded gate phase overrides                 |
| [13] | `/home/josh/dev/ava/apps/server/src/services/ceremony-state-machine.ts:19`                 | Silent invalid-event handling                  |
| [14] | `apps/server/src/services/completion-detector-service.ts:373-375`                          | Shell injection via epic title                 |
| [15] | `apps/server/src/services/coderabbit-resolver-service.ts:152-154`                          | GraphQL injection via repository name          |
| [16] | `apps/server/src/services/git-workflow-service.ts:913-916`                                 | GraphQL injection via repository name          |
| [17] | `apps/server/src/services/pr-status-checker.ts:149-151`                                    | GraphQL injection via repository name          |
| [18] | `apps/server/src/services/coderabbit-resolver-service.ts:222-224, 259-263`                 | Incomplete GraphQL string escaping             |
| [19] | `apps/server/src/services/event-hook-service.ts:715-724, 888-896`                          | Shell injection via hook variable substitution |
| [20] | `apps/server/src/services/lead-engineer-review-merge-processors.ts:357-358`                | Inconsistent branch name validation            |
| [21] | `apps/server/.env.example`                                                                 | Missing startup secret validation              |
| [22] | `apps/server/package.json`                                                                 | YAML deserialization risk                      |
| [23] | `apps/server/src/services/feature-scheduler.ts:404`                                        | startingFeatures.add()                         |
| [24] | `apps/server/src/services/auto-mode/auto-loop-coordinator.ts:87`                           | startingFeatures Set type                      |
| [25] | `apps/server/src/services/auto-mode-service.ts:203`                                        | Synchronous TOCTOU prevention                  |
| [26] | `apps/server/src/services/auto-mode/concurrency-manager.ts:38`                             | Lease-based concurrency with re-entrance       |
| [27] | `apps/server/src/services/auto-mode/concurrency-manager.ts:136`                            | Stale lease eviction                           |
| [28] | `apps/server/src/services/feature-scheduler.ts:413`                                        | Starting timeout with activity check           |
| [29] | `apps/server/src/services/auto-mode/auto-loop-coordinator.ts:148`                          | AbortController pattern                        |
| [30] | `apps/server/src/services/feature-scheduler.ts:335`                                        | Memory-pressure abort                          |
| [31] | `apps/server/src/services/auto-mode/auto-loop-coordinator.ts:261`                          | Rolling failure window circuit breaker         |
| [32] | `apps/server/src/services/event-hook-service.ts:682`                                       | Promise.allSettled for hooks                   |
| [33] | `apps/server/src/services/mcp-test-service.ts:64`                                          | Promise.race for timeout                       |
| [34] | `apps/server/src/services/auto-mode/execution-service.ts:2341`                             | Memory-pressure heartbeat                      |
| [35] | `apps/server/src/services/reactive-spawner-service.ts:9`                                   | Reactive spawner budget controls               |
| [36] | `apps/server/.automaker/memory/gotchas.md:622`                                             | Double-cleanup race gotcha                     |
| [37] | `apps/server/src/services/auto-mode/feature-state-manager.ts:77`                           | Persist-before-emit ordering                   |
| [38] | `apps/server/src/services/auto-mode/execution-service.ts:2289`                             | Timer cleanup pattern                          |
| [39] | `apps/server/src/services/auto-mode/execution-service.ts:1657`                             | Exponential backoff retry                      |
| [40] | `apps/server/src/services/auto-mode-service.ts:200`                                        | runningFeatures map                            |
| [41] | `apps/server/src/lib/circuit-breaker.ts`                                                   | Circuit breaker implementation                 |
| [42] | `apps/server/src/lib/error-handler.ts`                                                     | Server error classification                    |
| [43] | `libs/utils/src/error-handler.ts`                                                          | Shared error classification                    |
| [44] | `apps/server/src/lib/api-client.ts`                                                        | Bounded retry with backoff                     |
| [45] | `apps/server/src/lib/timeout-enforcer.ts`                                                  | Timeout enforcement                            |
| [46] | `apps/server/src/services/health-monitor-service.ts`                                       | Health monitor with auto-remediation           |
| [47] | `apps/server/src/services/recovery-service.ts`                                             | Six-strategy recovery service                  |
| [48] | `apps/server/src/services/worktree-recovery-service.ts`                                    | Worktree recovery                              |
| [49] | `apps/server/src/services/auto-mode/post-execution-middleware.ts`                          | Post-execution safety net                      |
| [50] | `apps/server/src/server/shutdown.ts`                                                       | Process-level crash guards                     |
| [51] | `apps/server/src/services/auto-mode/post-execution-middleware.ts:173`                      | Silent catch with logging                      |
| [52] | `apps/server/src/services/health-monitor-service.ts:335`                                   | Silent catch with logging                      |
| [53] | `/home/josh/dev/ava/vitest.config.ts:1-13`                                                 | Root vitest config with project discovery      |
| [54] | `/home/josh/dev/ava/apps/server/vitest.config.ts:11-36`                                    | Server coverage thresholds                     |
| [55] | `/home/josh/dev/ava/apps/server/vitest.config.ts:18-23`                                    | Coverage exclusions                            |
| [56] | `apps/server/src/services/git-workflow-service.ts`                                         | 1,660 lines, zero coverage                     |
| [57] | `apps/server/src/services/stream-observer-service.ts`                                      | 248 lines, zero coverage                       |
| [58] | `apps/server/src/services/coderabbit-resolver-service.ts`                                  | 471 lines, zero coverage                       |
| [59] | `/home/josh/dev/ava/.github/workflows/test.yml:53-73`                                      | CI test pipeline                               |
| [60] | `/home/josh/dev/ava/.github/workflows/test.yml:65-73`                                      | Codecov integration commented out              |
| [61] | `/home/josh/dev/ava/.automaker/projects/pipeline-autonomy-hardening/project.json:325-406`  | Milestone 5 test plan                          |
| [62] | `apps/server/tests/unit/services/execution-service.test.ts:1-80`                           | Test mock patterns                             |
| [63] | `apps/server/tests/unit/services/lead-engineer-execute-processor.test.ts:38-100`           | Factory helper patterns                        |
| [64] | `/home/josh/dev/ava/.automaker/projects/pipeline-autonomy-hardening/project.json:413-414`  | Fix phase constraints                          |
