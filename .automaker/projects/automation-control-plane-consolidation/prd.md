# PRD: Automation Control Plane Consolidation

## Situation
protoLabs Studio has two separate UI surfaces for controlling scheduled background tasks. The Maintenance section talks directly to /api/scheduler/* showing raw SchedulerService tasks. The Automations section talks to /api/automations/* showing the same 8 built-in tasks with richer metadata. Both were built at different times as the architecture evolved.

## Problem
Users see the same 8 maintenance tasks in two Settings sections. The Automations UI is missing 5 capabilities the Maintenance UI has: Run Now button, lastRunAt/nextRunAt timestamps, execution count, failure count, and human-readable cron expression display.

## Approach
Close the 5 capability gaps in AutomationsSection by enriching the /api/automations/list response with scheduler metadata and adding Run Now support, stats summary, human-readable cron, and a run history panel. Then delete MaintenanceSection, scheduler routes, and MaintenanceSettings type.

## Results
Single Automations control plane in Settings. All automations managed in one place with full CRUD, trigger type support, OTel-traced execution history, model config, and manual run capability.

## Constraints
SchedulerService stays as AutomationService internal infrastructure,Built-in automation records are protected (isBuiltIn: true),No behavior change to the 8 maintenance tasks themselves
