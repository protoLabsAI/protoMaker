# Lead Engineer Pipeline Alignment

Fix all 15 confirmed alignment gaps between documented/intended behavior and actual code in the Lead Engineer pipeline, event bus, ceremony system, and merge pipeline — making the full state machine, event-driven rules, ceremony lifecycle, and merge strategy work as designed.d

**Status:** active
**Created:** 2026-03-14T07:44:07.099Z
**Updated:** 2026-03-16T18:46:44.202Z

## Research Summary

The Lead Engineer pipeline contains **15 confirmed alignment gaps** across four subsystems: the feature processing state machine, the event bus rule engine, the ceremony lifecycle orchestrator, and the merge pipeline. The most critical defect is a chain of three interlocking bugs (C1–C3) where `DeployProcessor` returns `nextState: null` instead of `'DONE'` [2], causing every successfully deployed feature to be marked `'blocked'` instead of `'completed'` [3], because the outcome gate's `'DONE'` branch is permanently unreachable [12]. This single defect chain silently breaks knowledge indexing, downstream completion logic, and checkpoint cleanup.

Secondary clusters of bugs disable the ceremony lifecycle (stuck at `milestone_retro` due to missing `remainingMilestones` [19], dead `project:completed` event [21], bypassed retro executor [23]), render three event-bus rules permanently dead (`autoModeHealth` [41], `rollbackTriggered` [42], `mergedNotDone` [34]), and force all PR merges through `--squash` regardless of configured strategy [30]. The `rebaseWorktreeOnMain` function misleadingly uses `git merge` rather than rebase [36], and a base-branch default mismatch (`'dev'` vs `'main'`) creates silent integration failures [38].

No single gap is isolated — the bugs form dependency chains where fixing one (e.g., adding a `DONE` processor) without fixing others (e.g., `DeployProcessor` return value) yields partial remediation at best.

---

## PRD

### Situation

The Lead Engineer pipeline is the production nerve center of protoLabs Studio — a 7-state machine (INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE) with 17 fast-path rules, event-driven auto-mode coordination, ceremony lifecycle management, and PR merge orchestration. A comprehensive architecture audit confirmed 15 bugs where code behavior diverges from intended design across four subsystems: state machine terminal states, event bus wiring, ceremony payloads, and merge configuration.

### Problem

Three critical bugs silently break core flows: 1. **DeployProcessor returns null** — The state machine terminates in DEPLOY instead of DONE. LeadEngineerService checks `finalState === 'DONE'` for success, so ALL successfully deployed features get `outcome: 'blocked'` instead of `'completed'`. The DONE state is unreachable, and VERIFY is an orphaned enum value with no processor. 2. **ErrorBudgetService on wrong event bus** — Extends Node's EventEmitter instead of the shared app bus. error_budget:exhausted events emit on the service instance, but AutoModeCoordinator listens on the app bus. The freeze gate that should stop feature pickup during high failure rates is completely non-functional. 3. **Auto-mode event envelope mismatch** — TypedEventBus wraps all auto-mode events in an auto-mode:event envelope. Lead Engineer rules listen for direct auto-mode:stopped/auto-mode:idle events. The autoModeHealth rule never fires. Features accumulate in backlog when auto-mode stops. Beyond these criticals: feature lifecycle events never emitted (H1/H5/M8), ceremony state machine stuck (H2/H3), dead rules (H4), MergeProcessor hardcodes --squash (M3), PR merge race condition (M5), gate-tuning signals dropped (M7).

### Approach

Fix in four milestones ordered by dependency: M1 — State Machine Terminal State (C1, M1, M2, M4): Fix DeployProcessor to return nextState DONE, remove orphaned VERIFY enum, remove legacy verified status reference. M2 — Event Bus Alignment (C2, C3, H1, H5, M8): Three phases. Fix ErrorBudgetService event bus. Fix TypedEventBus envelope mismatch. Add feature lifecycle event emission. M3 — Ceremony Pipeline Completion (H2, H3, H4, M7): Two phases. Fix ceremony payloads. Remove dead rules and gate-tuning cleanup. M4 — Merge and Review Hardening (M3, M5): MergeProcessor reads prMergeStrategy. PR merge race guard.

### Results

After all milestones: Features correctly reach DONE with outcome completed. Error budget freeze gate activates. autoModeHealth rule fires to restart auto-mode. feature:blocked events reach escalation router. Ceremony advances through full lifecycle. MergeProcessor respects per-project merge strategy. No dead rules or subscribers remain.

### Constraints

Each phase must pass typecheck and server tests independently. No changes to Feature type or canonical 5-status system. Event changes must not break WebSocket streaming. ErrorBudgetService refactor must not change public API. MergeProcessor must preserve --merge for promotion PRs. Dead rule removal must not break DEFAULT_RULES array.

## Milestones

### 1. State Machine Terminal State Fix

Fix the DEPLOY to DONE transition so features correctly reach terminal state. Remove orphaned VERIFY enum and legacy status references. This is the foundation — everything downstream depends on features actually reaching DONE.

**Status:** pending

#### Phases

1. **Fix DeployProcessor DONE transition and clean up orphaned states** (small)

### 2. Event Bus Alignment

Fix the three event bus disconnects that leave critical rules and subscribers dead: ErrorBudgetService on wrong bus, auto-mode envelope mismatch, and missing feature lifecycle events.

**Status:** completed

#### Phases

1. **Fix ErrorBudgetService event bus wiring** (small)
2. **Fix auto-mode event envelope mismatch** (small)
3. **Emit feature lifecycle events from status changes** (medium)

### 3. Ceremony Pipeline Completion

Fix the ceremony state machine so it can advance through the full lifecycle. Remove dead rules and wire gate-tuning signals.

**Status:** completed

#### Phases

1. **Fix ceremony payloads with remainingMilestones and retroData** (medium)
2. **Remove dead rollbackTriggered rule and clean up gate-tuning** (small)

### 4. Merge and Review Hardening

Fix MergeProcessor to respect per-project merge strategy configuration and add a coordination guard between PRMergePoller and ReviewProcessor.

**Status:** pending

#### Phases

1. **MergeProcessor respects prMergeStrategy and PR merge race guard** (medium)
