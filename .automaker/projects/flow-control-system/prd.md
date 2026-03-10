# PRD: Flow Control System

## Situation
Auto-mode can run 2+ agents concurrently generating PRs, but nothing checks whether the review queue is already saturated before starting more work. The system has execution concurrency limits but no flow controls at the review, CI, or approval layers. DORA research explicitly identifies this as a critical risk for AI-assisted development teams.

## Problem
Without multi-layer WIP limits, the system can flood the review queue faster than PRs can be reviewed. Without PR size enforcement, agents can create massive PRs that are harder to review and more likely to introduce regressions. Without an error budget, there's no automatic brake when change fail rate spikes — the system keeps shipping even when quality degrades.

## Approach
Three capabilities in sequence: (1) Review queue WIP limits that auto-pause auto-mode when review backlog exceeds threshold, (2) PR size enforcement that blocks or decomposes features producing oversized PRs, (3) Error budget tracking that measures change fail rate over a rolling window and pauses feature work when the budget is exhausted.

## Results
Auto-mode automatically pauses when review queue saturates. PRs exceeding size limits are flagged or blocked. System auto-pauses feature work when error budget is exhausted, allowing only bug fixes. Measurable reduction in review queue depth and change fail rate.

## Constraints
Must integrate with existing FeatureScheduler and LeadEngineerRules without breaking current flow. WIP thresholds must be configurable via WorkflowSettings. Error budget window and threshold must be tunable. PR size limits should have override capability for justified large changes.
