# PRD: Lead Engineer Lifecycle Gaps

## Situation
The Lead Engineer state machine drives features through INTAKE -> PLAN -> EXECUTE -> REVIEW -> MERGE -> DONE. Auto-mode delegates to it for feature processing. The state machine's MergeProcessor merges PRs via gh CLI and transitions features to done.

## Problem
Three gaps cause features to get stuck or lose metadata: (1) MergeProcessor sets status='done' but never writes prMergedAt timestamp, breaking downstream rules and reporting. (2) When PRs are merged externally (GitHub auto-merge, manual merge), no event fires and features stay in 'review' forever. (3) World state refreshes every 5 minutes, so features entering review between refreshes are invisible to fast-path rules.

## Approach
Phase 1: Fix MergeProcessor to persist prMergedAt and completedAt when setting status to done. Phase 2: Add a periodic PR merge poller that checks features in 'review' with a prNumber and transitions merged ones to done. Phase 3: Add lazy feature population to world state event handler.

## Results
Features reaching done always have prMergedAt set. Externally merged PRs detected within 2-3 minutes. Fast-path rules see all features regardless of refresh timing. Zero manual intervention needed.

## Constraints
Must not break existing state machine flow,PR polling must respect GitHub API rate limits,Poller runs only when Lead Engineer is active,No schema changes needed — prMergedAt and completedAt already exist on Feature
