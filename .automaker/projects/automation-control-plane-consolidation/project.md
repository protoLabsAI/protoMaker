# Project: Automation Control Plane Consolidation

## Goal
Consolidate the duplicate Maintenance and Automations UIs into a single Automations control plane by achieving feature parity in AutomationsSection, deleting the MaintenanceSection, and removing the orphaned scheduler routes.

## Milestones
1. Backend: Enrich Automation List with Scheduler Metadata - Make /api/automations/list return lastRunAt, nextRunAt, executionCount, and failureCount by merging SchedulerService task data into the Automation list response.
2. UI: Automations Section Feature Parity - Add the 5 capabilities the Automations UI is missing vs the Maintenance UI, plus a run history panel.
3. Cleanup: Delete Maintenance Section and Scheduler Routes - Remove all legacy Maintenance UI code, scheduler backend routes, navigation entry, and MaintenanceSettings type.
