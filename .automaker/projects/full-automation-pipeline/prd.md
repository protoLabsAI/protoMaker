# PRD: Full Automation Pipeline

## Situation
Automaker has substantial automation infrastructure — auto-mode picks up backlog features, creates git worktrees, runs Claude agents, commits code, pushes branches, and creates PRs automatically. Authority agents (PM, ProjM, EM, Status) handle idea review, decomposition, and PR feedback routing. CoS pipeline automates PRD-to-feature flow. Health monitor runs 5-minute checks with auto-remediation. 10 automation systems are working on main.

## Problem
The automation chain BREAKS at PR review and merge. PRs are created automatically but auto-merge is disabled by default (autoMergePR: false). Branch protection requires review approval (not automated). CodeRabbit review threads block auto-merge and require manual resolution. Failed features stay in 'blocked' status with no auto-retry. EM agent detects PR approval events but doesn't execute merges. Result: features pile up in 'review' status waiting for manual intervention, breaking the autonomous loop.

## Approach
Four-phase approach targeting the highest-impact gaps first. Phase 1 closes the PR-to-merge gap (auto-merge toggle, CodeRabbit thread resolution, EM agent merge execution). Phase 2 adds failure resilience (auto-retry blocked features, PR feedback auto-remediation). Phase 3 enables proactive maintenance (stale resource cleanup, PR rebase, scheduled merge polling). Phase 4 adds intelligence (policy-driven merge decisions, learning from failures). Each phase is independently valuable — Phase 1 alone achieves 80% autonomy.

## Results
Features flow from backlog to done with zero manual intervention for standard complexity work. PRs auto-merge when CI passes. Failed features auto-retry with model escalation. Stale resources auto-cleanup. The only manual intervention needed is for architectural decisions, security reviews, and infrastructure-level changes.

## Constraints
Branch protection must stay enabled — safety net for main,Dev server management stays manual — crashes are destructive,Max 2-3 concurrent agents on dev hardware — staging supports 6-10,Keep PRs under 200 lines for reviewability,Feature.json files are now git-tracked — agents must not delete them,Never use git add -A with tracked feature.json files in worktrees
