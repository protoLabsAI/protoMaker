# Ops Control Plane Architecture

This page explains how the server's operational infrastructure is organized. It covers the five operational domains that were unified under a single control plane, how they interact, and why the design decisions were made. Read this to understand the "why" behind the ops layer before diving into specific how-to guides.

## The Problem: Five Isolated Domains

Before the ops control plane, operational concerns lived in separate, disconnected systems:

1. **Scheduler** -- Cron-based task execution with no visibility into what tasks exist or their health.
2. **Calendar** -- Feature lifecycle events tracked independently, with no connection to operational scheduling.
3. **Webhooks** -- Inbound event delivery from GitHub, Discord, and other integrations with no delivery tracking or retry logic.
4. **Maintenance** -- Board health checks, worktree cleanup, and data integrity sweeps running on ad-hoc timers.
5. **Auto-mode** -- Autonomous feature execution with its own concurrency management and circuit breaker.

Each domain had its own timer management, its own health reporting, and its own failure handling. Operators had no single place to see what the server was doing, what had failed, or what was about to run.

## The Unified Model

The ops control plane unifies these domains under shared infrastructure:

```
SchedulerService (Timer Registry)
    |
    +-- MaintenanceOrchestrator (composable check modules)
    |       |-- critical tier (every 5 min)
    |       +-- full tier (every 6 hours)
    |
    +-- EventRouterService (signal classification + delivery)
    |       |-- GitHub webhooks
    |       |-- Discord events
    |       +-- Internal signals
    |
    +-- CalendarIntegrationService (ops timeline)
    |       |-- Feature lifecycle events
    |       +-- Deployment markers
    |
    +-- AutoModeService (autonomous execution)
    |       |-- Concurrency slots
    |       +-- Circuit breaker
    |
    +-- OpsTracingService (observability layer)
            |-- Maintenance sweep traces
            |-- Webhook delivery traces
            +-- Timer tick traces (sampled)
```

## Timer Registry

The `SchedulerService` is the backbone. Every recurring operation in the server registers through `registerTask()` with a cron expression, a handler function, and metadata.

The timer registry provides:

- **Discovery**: All timers are enumerable via `getAllTasks()`. The Ops Dashboard reads this to show what is running.
- **Lifecycle control**: Each timer can be individually paused, resumed, or rescheduled at runtime without restarting the server.
- **Persistence**: Execution counts, failure counts, and last/next run times survive server restarts via `scheduled-tasks.json`.
- **Settings overrides**: Operators can change cron expressions or disable timers through `schedulerSettings.taskOverrides` in global settings. These persist across server restarts and take precedence over code defaults.

### Registration Pattern

Tasks register during server wiring, typically in a `*.module.ts` file:

```typescript
await schedulerService.registerTask(
  'maintenance-critical',
  'Critical Maintenance Sweep',
  '*/5 * * * *', // every 5 minutes
  () => maintenanceOrchestrator.runCriticalSweep(),
  true // enabled by default
);
```

The scheduler checks every 60 seconds whether any registered task's cron expression matches the current minute. Double-execution within the same minute is prevented by comparing against `lastRun`.

## MaintenanceOrchestrator

The maintenance system uses composable check modules organized into two tiers:

### Critical Tier (Every 5 Minutes)

Checks that detect issues requiring immediate attention:

- **Data integrity** -- Monitors feature directory count for unexpected changes.
- **Stale features** -- Finds features stuck in `in_progress` beyond the timeout threshold.
- **Auto-merge eligible PRs** -- Merges PRs that pass all required checks.
- **GitHub Actions runner health** -- Detects stuck CI builds.

### Full Tier (Every 6 Hours)

Broader sweeps that are safe to run less frequently:

- **Worktree auto-cleanup** -- Removes worktrees for branches that have been merged.
- **Branch auto-cleanup** -- Deletes local branches already merged to main.
- **Board health reconciliation** -- Audits and auto-fixes board state inconsistencies.
- **Auto-rebase stale PRs** -- Rebases PRs that have fallen behind their base branch.

Each check module follows the `MaintenanceCheck` interface: it receives context about the current project state and returns a result with `issuesFound` and `fixesApplied` counts. The orchestrator aggregates these results and reports them through the event bus.

## EventRouterService

The `SignalIntakeService` classifies inbound events and routes them to the appropriate handler:

```
Inbound Event
  --> SignalIntakeService.classifySignal()
      |
      +-- ops signal --> ChannelRouter --> appropriate handler
      +-- gtm signal --> GtmExecuteProcessor / GtmReviewProcessor
```

Classification determines whether an event affects operational infrastructure (ops) or go-to-market content (gtm). Each signal type has a dedicated channel handler registered in `channel-handlers/`.

### Delivery Tracking

The `EventHistoryService` stores every event with metadata including severity, trigger type, and processing result. This provides:

- Audit trail for debugging event-driven bugs.
- Replay capability for testing hook configurations.
- Retention management to prevent unbounded disk growth.

## CalendarIntegrationService

Feature lifecycle transitions (backlog, in_progress, review, done, blocked) generate calendar events through the `CalendarService`. These provide an operational timeline showing:

- When features moved through states.
- How long features spent in each state.
- When maintenance sweeps ran and what they found.

The Google Calendar sync (`GoogleCalendarSyncService`) optionally mirrors these events to an external calendar for team visibility.

## OpsTracingService

The tracing layer wraps maintenance sweeps, webhook deliveries, and timer ticks with structured trace records. It integrates with Langfuse when configured and gracefully degrades to structured logging when Langfuse is unavailable.

Key design decisions:

- **Probabilistic sampling for timer ticks**: High-frequency timers (every 5 minutes, 60+ checks/day) would overwhelm a tracing backend at 100% capture. The default 1% sample rate captures enough for trend analysis without volume concerns.
- **Errors always traced**: When `isError` is true, the sample rate is bypassed. Every failure gets a trace regardless of sampling.
- **Structured log fallback**: Even without Langfuse, trace calls emit structured log entries that can be ingested by any log aggregation system.

## How They Fit Together

A typical server lifecycle demonstrates the integration:

1. **Startup**: `wiring.ts` calls each `*.module.ts` register function. Timers are registered with the scheduler. Maintenance checks are registered with the orchestrator. Event handlers are registered with the channel router.

2. **Steady state**: The scheduler ticks every 60 seconds. When a cron expression matches, it executes the handler. Maintenance sweeps run their check modules. Results flow through the event bus. The Ops Dashboard subscribes via WebSocket for real-time updates.

3. **Incident**: A maintenance check detects a stuck feature. It auto-remediates by resetting the feature to backlog. The event is traced (always, since it is an error). The calendar records the remediation. The Ops Dashboard updates in real time.

4. **Shutdown**: Timers are persisted. Active traces are flushed. The scheduler stops cleanly.

## Key Files

| File                                                | Role                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/server/src/services/scheduler-service.ts`     | Timer registry with cron parsing, persistence, and lifecycle control |
| `apps/server/src/services/maintenance-tasks.ts`     | Built-in maintenance check handlers registered as automation flows   |
| `apps/server/src/services/signal-intake-service.ts` | Inbound event classification and routing                             |
| `apps/server/src/services/event-history-service.ts` | Persistent event storage for audit and replay                        |
| `apps/server/src/services/calendar-service.ts`      | Feature lifecycle calendar events                                    |
| `apps/server/src/services/ops-tracing-service.ts`   | Structured tracing with Langfuse integration                         |
| `apps/server/src/services/auto-mode-service.ts`     | Autonomous execution with concurrency management                     |
| `apps/server/src/server/wiring.ts`                  | Cross-service wiring orchestrator                                    |

## See Also

- **[Timer Registry](./timer-registry.md)** -- How to add new timers
- **[Maintenance Checks](./maintenance-checks.md)** -- How to create new check modules
- **[Ops Dashboard](./ops-dashboard.md)** -- Reference for the dashboard UI and API
- **[DORA Metrics](./dora-metrics.md)** -- Team health monitoring via feature-based proxy metrics
