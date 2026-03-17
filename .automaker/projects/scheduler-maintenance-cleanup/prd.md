# PRD: Scheduler & Maintenance Cleanup

## Situation
The server runs 38 concurrent recurring timers across three registration patterns: SchedulerService cron tasks, SchedulerService intervals, and raw setInterval calls. 15 raw setInterval timers bypass the scheduler and are invisible in the Ops Dashboard timer registry. 5 maintenance check modules exist as dead code (files present but never registered). Board health is checked in 3 overlapping places. PR monitoring is fragmented across 4-5 services. The daily standup uses a wasteful 15-minute poll pattern instead of a single daily cron.

## Problem
1) 15 raw setInterval timers are invisible to operators — no pause/resume, no metrics, no Ops Dashboard visibility. 2) 5 dead maintenance check modules in services/maintenance/checks/ create confusion — they overlap with automation-service tasks but are never registered. 3) Board health duplication across ava-cron-tasks, maintenance-orchestrator, and automation-service wastes compute and creates conflicting results. 4) PR monitoring fragmented across pr-watcher, pr-feedback, ava-pr-triage, auto-merge, and auto-rebase services. 5) daily-standup:check polls every 15 minutes to check if 20 hours passed — should be a single daily cron.

## Approach
Five workstreams: (1) Migrate top 5 long-lived raw setInterval timers to schedulerService.registerInterval() — PRFeedbackService, WorktreeLifecycleModule, WorktreeLifecycleService, ArchivalService, ProjectAssignmentService. (2) Delete 5 dead maintenance check module files that are never registered. (3) Simplify daily-standup from 15-min poll to daily cron. (4) Remove board-health check from maintenance.module.ts (keep automation-service version + ava-cron Discord reporter). (5) Merge pr-watcher-service into pr-feedback-service to consolidate PR monitoring.

## Results
All long-lived background timers visible in Ops Dashboard. Dead code removed. No duplicate board health checks. PR monitoring consolidated to fewer services. Daily standup fires once at 9am instead of polling. Measurable: timer count in Ops Dashboard increases by 5 (migrated), dead files removed, no behavioral changes to existing functionality.

## Constraints
Must not change runtime behavior — only registration pattern changes for timer migrations. Dead code deletion must verify zero importers first. PR consolidation must preserve all existing monitoring capabilities. All changes must pass existing tests.
