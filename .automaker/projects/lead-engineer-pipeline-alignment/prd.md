# PRD: Lead Engineer Pipeline Alignment

## Situation

The Lead Engineer pipeline is the production nerve center of protoLabs Studio — a 7-state machine (INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE) with 17 fast-path rules, event-driven auto-mode coordination, ceremony lifecycle management, and PR merge orchestration. A comprehensive architecture audit confirmed 15 bugs where code behavior diverges from intended design across four subsystems: state machine terminal states, event bus wiring, ceremony payloads, and merge configuration.

## Problem

Three critical bugs silently break core flows: 1. **DeployProcessor returns null** — The state machine terminates in DEPLOY instead of DONE. LeadEngineerService checks `finalState === 'DONE'` for success, so ALL successfully deployed features get `outcome: 'blocked'` instead of `'completed'`. The DONE state is unreachable, and VERIFY is an orphaned enum value with no processor. 2. **ErrorBudgetService on wrong event bus** — Extends Node's EventEmitter instead of the shared app bus. error_budget:exhausted events emit on the service instance, but AutoModeCoordinator listens on the app bus. The freeze gate that should stop feature pickup during high failure rates is completely non-functional. 3. **Auto-mode event envelope mismatch** — TypedEventBus wraps all auto-mode events in an auto-mode:event envelope. Lead Engineer rules listen for direct auto-mode:stopped/auto-mode:idle events. The autoModeHealth rule never fires. Features accumulate in backlog when auto-mode stops. Beyond these criticals: feature lifecycle events never emitted (H1/H5/M8), ceremony state machine stuck (H2/H3), dead rules (H4), MergeProcessor hardcodes --squash (M3), PR merge race condition (M5), gate-tuning signals dropped (M7).

## Approach

Fix in four milestones ordered by dependency: M1 — State Machine Terminal State (C1, M1, M2, M4): Fix DeployProcessor to return nextState DONE, remove orphaned VERIFY enum, remove legacy verified status reference. M2 — Event Bus Alignment (C2, C3, H1, H5, M8): Three phases. Fix ErrorBudgetService event bus. Fix TypedEventBus envelope mismatch. Add feature lifecycle event emission. M3 — Ceremony Pipeline Completion (H2, H3, H4, M7): Two phases. Fix ceremony payloads. Remove dead rules and gate-tuning cleanup. M4 — Merge and Review Hardening (M3, M5): MergeProcessor reads prMergeStrategy. PR merge race guard.

## Results

After all milestones: Features correctly reach DONE with outcome completed. Error budget freeze gate activates. autoModeHealth rule fires to restart auto-mode. feature:blocked events reach escalation router. Ceremony advances through full lifecycle. MergeProcessor respects per-project merge strategy. No dead rules or subscribers remain.

## Constraints

Each phase must pass typecheck and server tests independently. No changes to Feature type or canonical 5-status system. Event changes must not break WebSocket streaming. ErrorBudgetService refactor must not change public API. MergeProcessor must preserve --merge for promotion PRs. Dead rule removal must not break DEFAULT_RULES array.
