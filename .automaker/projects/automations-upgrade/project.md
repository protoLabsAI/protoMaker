# Project: Automations Upgrade

## Goal
Promote the Automations section from a simple CRUD panel into the single control plane for all scheduled work — built-in maintenance tasks, user automations, and scheduler health. Every operator action (enable/disable, reschedule, view metrics, triage failures) happens in one place without needing MCP access.

## Milestones
1. Scheduler REST API - Add REST endpoint exposing SchedulerService status so the UI can fetch health data without MCP. Foundation for the health dashboard — all downstream milestones depend on this endpoint existing.
2. Settings Persistence - Persist built-in maintenance task configuration (enabled state, cron overrides) in GlobalSettings so it survives server restarts. Today this resets to defaults on every restart.
3. Branch-Aware PR Tasks - Fix auto-merge-prs and auto-rebase-stale-prs maintenance tasks to respect the configured prBaseBranch instead of hardcoding main. These two tasks operate on PRs and must target the correct integration branch.
4. Health Dashboard and Failure Alerting - Build the SchedulerHealthGrid UI component and add scheduler:task-failed event emission with WebSocket push. The health grid shows all tasks with next-run countdowns, last-run results, and execution counts. Failure alerting surfaces errors in the UI within 60 seconds.
