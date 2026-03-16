# Pipeline Autonomy Hardening

Make the Lead Engineer + auto-mode pipeline a fully autonomous, self-healing machine from backlog to dev with zero human intervention. Fix all 86 audit findings across security, concurrency, state machine correctness, error handling, and test coverage.

**Status:** active
**Created:** 2026-03-14T19:00:57.078Z
**Updated:** 2026-03-16T18:46:44.252Z

## Research Summary

The Pipeline Autonomy Hardening project targets 86 audit findings across the Lead Engineer auto-mode pipeline, spanning five domains: **security** (shell/GraphQL injection), **state machine correctness** (missing processors, logging bugs, transition budget exhaustion), **concurrency** (in-memory deduplication races, recursive timeouts), **error handling** (silent catch blocks, no DLQ), and **test coverage** (three zero-coverage services totaling ~2,379 lines). The pipeline's architecture is a processor-per-state machine (`FeatureStateMachine`) orchestrated by a `PipelineOrchestrator`, with auto-mode coordination handled by `FeatureScheduler`, `AutoLoopCoordinator`, and `ConcurrencyManager`. While the system already implements multi-layered self-healing (circuit breakers [41], bounded retry [44], stale-lease eviction [27], memory-pressure abort [34], health monitoring [46]), critical gaps remain: **four shell/GraphQL injection vectors** [14][15][16][17][18][19], a **missing DONE state processor** causing invalid transitions on resume [3], an **infinite recursion bug** in worktree-lock timeout handling [11], and a **tight transition budget** that forces premature escalation under normal remediation load [8]. Fixing these 86 findings requires coordinated changes across ~15 service files, with each fix phase constrained to 30–60 minutes and gated by `npm run test:server` + `npm run typecheck` [64].

---

## PRD

### Situation

The Lead Engineer state machine, auto-mode orchestration, and supporting services form the core execution pipeline. A deep audit of ~15 service files (totaling ~12,000+ lines) uncovered 86 findings: 6 CRITICAL (injection vulnerabilities, race conditions that lose data), 17 HIGH (state machine stuck paths, dual-tracking divergence, sync I/O blocking event loop), 15+ MEDIUM (TOCTOU gaps, dead code, wiring holes), plus 3 critical services (~2,400 lines) with zero test coverage.

### Problem

The pipeline works on happy paths but breaks under concurrent events, failure recovery, and edge cases. Features get permanently stuck (staleDeps rule broken, ESCALATE never runs), duplicated (runningFeatures tracking gap), silently lose state (feature-loader read-modify-write race), or create security vulnerabilities (shell/GraphQL injection via user-supplied epic titles). The result is a pipeline that requires constant human oversight -- defeating the purpose of autonomous execution.

### Approach

Five-milestone hardening campaign executed by autonomous agents: (1) Security fixes for injection vulnerabilities, (2) Concurrency and race condition elimination with per-resource mutexes, (3) State machine correctness ensuring every transition path leads to a valid terminal state, (4) Error handling and recovery making the pipeline self-healing on transient failures, (5) Critical test coverage for the 3 untested services plus regression tests for all fixes. Each phase modifies 1-3 files and is independently testable.

### Results

Zero-intervention pipeline from backlog to dev. Every feature either completes autonomously or escalates with a clear, actionable reason. No data loss from concurrent operations. No injection vulnerabilities. No stuck features. No orphaned agents. Test coverage for all critical path services.

### Constraints

Each phase must be completable by a single agent in 30-60 minutes. No breaking changes to existing MCP tool APIs. All fixes must include unit tests for the specific bug being fixed. Must pass npm run test:server and npm run typecheck after each phase. Security fixes (M1) must land first. Concurrency fixes (M2) should land before state machine fixes (M3) since race conditions can mask logic bugs.

## Milestones

### 1. Security Hardening

Fix injection vulnerabilities that allow arbitrary command execution via user-supplied content

**Status:** pending

#### Phases

1. **Fix shell injection in CompletionDetector gh pr create** (small)
2. **Fix GraphQL injection in CodeRabbitResolver and git-workflow-service** (medium)

### 2. Concurrency and Race Condition Fixes

Eliminate data races that cause silent state loss, duplicate agents, and stuck features

**Status:** pending

#### Phases

1. **Add per-feature mutex to FeatureLoader update and claim** (medium)
2. **Add per-session event processing queue to Lead Engineer** (medium)
3. **Fix ExecuteProcessor waitForCompletion race and pre-flight shouldContinue** (large)
4. **Fix runningFeatures tracking gap in execution-service** (medium)
5. **Unify concurrency tracking and fix settings and ledger races** (large)

### 3. State Machine Correctness

Ensure every state transition leads to a valid terminal state with no stuck paths

**Status:** pending

#### Phases

1. **Fix staleDeps rule - done features excluded from worldState** (small)
2. **Fix state machine null nextState and DONE terminal handling** (medium)
3. **Fix action executor race and enable_auto_merge strategy** (medium)
4. **Fix error classification breadth and merge retry logic** (medium)

### 4. Error Handling and Recovery

Make the pipeline self-healing on transient failures with proper detection and recovery

**Status:** pending

#### Phases

1. **Fix ErrorBudget sync IO and unbounded record growth** (medium)
2. **Fix worktree recovery rebase conflicts and stream observer hang detection** (medium)
3. **Fix git workflow counter and agent queue stall and scheduler timeout** (small)
4. **Add missing failure patterns and fix classifier regex and wiring** (medium)

### 5. Critical Test Coverage

Add dedicated unit tests for untested critical-path services plus regression tests

**Status:** pending

#### Phases

1. **Add git-workflow-service unit tests** (large)
2. **Add stream-observer-service unit tests** (medium)
3. **Add coderabbit-resolver-service unit tests** (medium)
4. **Add Lead Engineer state transition regression tests** (medium)
