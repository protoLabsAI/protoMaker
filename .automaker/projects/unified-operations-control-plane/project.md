# Unified Operations Control Plane

Consolidate 16+ independent timer loops, 4 overlapping board health systems, and disconnected calendar/scheduler/webhook/maintenance systems into a single cohesive Operations Control Plane with unified timer registry, maintenance orchestrator, enhanced calendar, event router, ops dashboard, and observability integration.

**Status:** active
**Created:** 2026-03-15T22:06:14.180Z
**Updated:** 2026-03-15T23:09:46.474Z

## Research Summary

The production codebase contains **24 independent `setInterval` timer loops** [1][2][3][8][15][16] scattered across services, **4 overlapping board health systems** [3][4][5][6], and a set of disconnected subsystems (calendar, scheduler, webhooks, maintenance) that communicate through a bespoke in-memory event bus [18] with no shared persistence layer [12]. All scheduling is hand-rolled — zero third-party scheduler libraries exist in `package.json` [37] — and the existing `SchedulerService` covers only cron-registered tasks while 16+ polling loops bypass it entirely [38]. Observability is critically gapped: the Prometheus registry exposes 10 custom metrics focused on agents and HTTP, with **zero coverage** for scheduler task durations, health-check results, loop states, or circuit-breaker activity [42][68][70][71]. Grafana dashboards and alerting rules are consequently blind to the operational subsystems this project aims to unify [74][75]. The consolidation path is viable because all services already share a common `EventEmitter` bus [18], a centralized timeout configuration [39], and a single wiring entry point [27], but the testing surface is thin in the exact areas that will change most — health, maintenance, and timer lifecycle [63][65].

---

## PRD

### Situation

protoLabs Studio runs 40+ service files across five disconnected automation domains: (1) a SchedulerService with full cron support that only manages 11 registered tasks, (2) a CalendarService with job execution but no recurring events or timezone support, (3) a webhook/event system with 351 event types but no retry or delivery tracking, (4) four overlapping maintenance/health systems (FeatureHealthService, HealthMonitorService, board-health cron, maintenance-flow LangGraph), and (5) auto-mode orchestration with its own timer hierarchy. Critically, 16+ services create their own setInterval loops outside the SchedulerService — HealthMonitorService (30s), ArchivalService (10min), WorktreeLifecycleService (6h), PRWatcherService (30s), SpecGenerationMonitor (30s), SensorRegistryService (30s), AgentManifestService (2s), GitHubMonitor (30s), DiscordMonitor (30s), LeadEngineerService (5min+30s+2.5min), FeatureScheduler (2-30s), AutoModeService (2s), CrdtSyncService (30s). There is no single control plane to view, pause, or manage all running background operations.

### Problem

The fragmented automation landscape creates five concrete problems: (1) No visibility — operators cannot see what background tasks are running, when they last fired, or if they are healthy. (2) Overlapping work — four different systems audit board health with different thresholds and schedules, wasting compute and potentially conflicting. (3) Missing connections — auto-mode does not create calendar events, webhooks do not feed the timeline, maintenance results are not traced in Langfuse. (4) No unified control — you cannot pause all background operations during a deploy or investigation; each service must be stopped individually. (5) Reliability gaps — webhook processing has no retry logic, no delivery tracking, no rate limiting, and no secret rotation support.

### Approach

Build a Unified Operations Control Plane in six milestones: M1 creates a TimerRegistry that extends SchedulerService to support interval-based tasks, then migrates all 16 setInterval loops to register through it. M2 consolidates the four overlapping board health systems into a single MaintenanceOrchestrator with composable check modules. M3 enhances the calendar with recurring events, timezone support, and bidirectional auto-mode/webhook integration. M4 unifies the event routing layer with webhook delivery tracking, retry logic, and rate limiting. M5 builds an Ops Dashboard UI view showing timer status, event flow, calendar, and health in one place. M6 wires everything into Langfuse for observability.

### Results

After completion: (1) Single pane of glass for all background operations — every timer, cron job, and health check visible and controllable from the Ops Dashboard. (2) Board health audited by one system instead of four, eliminating conflicting auto-fixes. (3) Calendar reflects reality — feature starts, PR merges, deploys, and ceremonies all appear on the timeline with recurring event support. (4) Webhook reliability — delivery tracking, automatic retry with exponential backoff, rate limiting. (5) Full observability — every maintenance sweep, timer tick, and webhook delivery traced in Langfuse with cost/duration metrics. (6) Operational control — pause all background operations with one action during deploys or investigations.

### Constraints

No backward compatibility shims (greenfield-first). All services must continue working during migration (feature-flag new paths). Timer registry migration must be incremental (service by service). Maintenance consolidation must preserve all existing auto-fix capabilities. Calendar recurring events must extend existing CalendarEvent schema. Webhook retry must be idempotent (no duplicate feature creation). UI dashboard is additive (new route /ops). Must pass all existing tests. Keep docs updated. ReconciliationService stays separate (event-driven). Central timeout config in timeouts.ts is the single source of truth.

## Milestones

### 1. Timer Registry Foundation

Extend SchedulerService to support interval-based tasks alongside cron, create a TimerRegistry interface, migrate all 16+ independent setInterval loops to register through it, and add pause/resume/list/metrics capabilities.

**Status:** completed

#### Phases

1. **TimerRegistry interface and SchedulerService extension** (medium)
2. **Migrate health and monitoring services to TimerRegistry** (medium)
3. **Migrate lifecycle and sync services to TimerRegistry** (medium)
4. **Migrate external monitors and Lead Engineer timers** (medium)
5. **Timer Registry API routes and MCP tools** (medium)

### 2. Maintenance Consolidation

Merge the four overlapping board health systems into a single MaintenanceOrchestrator with composable check modules.

**Status:** pending

#### Phases

1. **MaintenanceOrchestrator service with check module interface** (medium)
2. **Extract health checks to maintenance modules** (large)
3. **Wire MaintenanceOrchestrator and remove old systems** (large)

### 3. Calendar Enhancements

Add recurring event support, timezone handling, bidirectional auto-mode/webhook integration, and job conflict detection.

**Status:** pending

#### Phases

1. **Recurring events and timezone support** (medium)
2. **Auto-mode and webhook calendar integration** (medium)
3. **Job conflict detection and calendar UI updates** (medium)

### 4. Event Router Unification

Consolidate webhook handling with delivery tracking, retry logic, rate limiting, and secret rotation.

**Status:** pending

#### Phases

1. **Webhook delivery tracking and retry service** (medium)
2. **Rate limiting and webhook secret rotation** (medium)
3. **Event Router service and delivery API** (medium)

### 5. Ops Dashboard

New UI view providing single pane of glass for all background operations.

**Status:** pending

#### Phases

1. **Ops Dashboard layout and timer status panel** (medium)
2. **Event flow and maintenance panels** (medium)
3. **System health and sidebar integration** (medium)

### 6. Observability Integration

Wire operational systems into Langfuse for tracing, cost tracking, and DORA metrics.

**Status:** pending

#### Phases

1. **Maintenance and timer observability traces** (medium)
2. **Webhook delivery and DORA metrics** (medium)
3. **Operations Control Plane documentation** (medium)
