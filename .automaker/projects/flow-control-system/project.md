# Flow Control System

Prevent the system from generating more work than it can safely validate by adding WIP limits at the review layer, PR size enforcement, and an error budget system with auto-pause.

**Status:** active
**Created:** 2026-03-10T09:31:16.471Z
**Updated:** 2026-03-10T11:23:01.008Z

## PRD

### Situation

Auto-mode can run 2+ agents concurrently generating PRs, but nothing checks whether the review queue is already saturated before starting more work. The system has execution concurrency limits but no flow controls at the review, CI, or approval layers. DORA research explicitly identifies this as a critical risk for AI-assisted development teams.

### Problem

Without multi-layer WIP limits, the system can flood the review queue faster than PRs can be reviewed. Without PR size enforcement, agents can create massive PRs that are harder to review and more likely to introduce regressions. Without an error budget, there's no automatic brake when change fail rate spikes — the system keeps shipping even when quality degrades.

### Approach

Three capabilities in sequence: (1) Review queue WIP limits that auto-pause auto-mode when review backlog exceeds threshold, (2) PR size enforcement that blocks or decomposes features producing oversized PRs, (3) Error budget tracking that measures change fail rate over a rolling window and pauses feature work when the budget is exhausted.

### Results

Auto-mode automatically pauses when review queue saturates. PRs exceeding size limits are flagged or blocked. System auto-pauses feature work when error budget is exhausted, allowing only bug fixes. Measurable reduction in review queue depth and change fail rate.

### Constraints

Must integrate with existing FeatureScheduler and LeadEngineerRules without breaking current flow. WIP thresholds must be configurable via WorkflowSettings. Error budget window and threshold must be tunable. PR size limits should have override capability for justified large changes.

## Milestones

### 1. Review Queue WIP Limits

Track PR review queue depth and auto-pause auto-mode when it exceeds threshold.

**Status:** completed

#### Phases

1. **Add review queue depth tracking and auto-pause rule** (medium)

### 2. PR Size Enforcement

Enforce maximum PR size to keep changes reviewable and reduce regression risk.

**Status:** pending

#### Phases

1. **Add PR size check to git-workflow-service** (medium)

### 3. Error Budget System

Track change fail rate and auto-pause feature work when error budget is exhausted.

**Status:** pending

#### Phases

1. **Implement error budget tracker with auto-pause** (medium)
