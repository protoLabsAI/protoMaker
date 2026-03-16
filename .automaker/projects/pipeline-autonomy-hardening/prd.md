# PRD: Pipeline Autonomy Hardening

## Situation

The Lead Engineer state machine, auto-mode orchestration, and supporting services form the core execution pipeline. A deep audit of ~15 service files (totaling ~12,000+ lines) uncovered 86 findings: 6 CRITICAL (injection vulnerabilities, race conditions that lose data), 17 HIGH (state machine stuck paths, dual-tracking divergence, sync I/O blocking event loop), 15+ MEDIUM (TOCTOU gaps, dead code, wiring holes), plus 3 critical services (~2,400 lines) with zero test coverage.

## Problem

The pipeline works on happy paths but breaks under concurrent events, failure recovery, and edge cases. Features get permanently stuck (staleDeps rule broken, ESCALATE never runs), duplicated (runningFeatures tracking gap), silently lose state (feature-loader read-modify-write race), or create security vulnerabilities (shell/GraphQL injection via user-supplied epic titles). The result is a pipeline that requires constant human oversight -- defeating the purpose of autonomous execution.

## Approach

Five-milestone hardening campaign executed by autonomous agents: (1) Security fixes for injection vulnerabilities, (2) Concurrency and race condition elimination with per-resource mutexes, (3) State machine correctness ensuring every transition path leads to a valid terminal state, (4) Error handling and recovery making the pipeline self-healing on transient failures, (5) Critical test coverage for the 3 untested services plus regression tests for all fixes. Each phase modifies 1-3 files and is independently testable.

## Results

Zero-intervention pipeline from backlog to dev. Every feature either completes autonomously or escalates with a clear, actionable reason. No data loss from concurrent operations. No injection vulnerabilities. No stuck features. No orphaned agents. Test coverage for all critical path services.

## Constraints

Each phase must be completable by a single agent in 30-60 minutes. No breaking changes to existing MCP tool APIs. All fixes must include unit tests for the specific bug being fixed. Must pass npm run test:server and npm run typecheck after each phase. Security fixes (M1) must land first. Concurrency fixes (M2) should land before state machine fixes (M3) since race conditions can mask logic bugs.
