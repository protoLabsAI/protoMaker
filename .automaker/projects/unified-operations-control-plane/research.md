# Research Report: Unified Operations Control Plane

Generated: 2026-03-15T22:20:19.359Z
Sub-topics investigated: 5
Total citations: 78
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

# Unified Operations Control Plane — Research Report

## Summary

The production codebase contains **24 independent `setInterval` timer loops** [1][2][3][8][15][16] scattered across services, **4 overlapping board health systems** [3][4][5][6], and a set of disconnected subsystems (calendar, scheduler, webhooks, maintenance) that communicate through a bespoke in-memory event bus [18] with no shared persistence layer [12]. All scheduling is hand-rolled — zero third-party scheduler libraries exist in `package.json` [37] — and the existing `SchedulerService` covers only cron-registered tasks while 16+ polling loops bypass it entirely [38]. Observability is critically gapped: the Prometheus registry exposes 10 custom metrics focused on agents and HTTP, with **zero coverage** for scheduler task durations, health-check results, loop states, or circuit-breaker activity [42][68][70][71]. Grafana dashboards and alerting rules are consequently blind to the operational subsystems this project aims to unify [74][75]. The consolidation path is viable because all services already share a common `EventEmitter` bus [18], a centralized timeout configuration [39], and a single wiring entry point [27], but the testing surface is thin in the exact areas that will change most — health, maintenance, and timer lifecycle [63][65].

---

## Codebase Findings

### 1. Timer Proliferation: 24 Independent `setInterval` Loops

Every service independently manages its own timer handle using the same anti-pattern:

```typescript
// FILE: apps/server/src/services/archival-service.ts:33, 55–59
private timer: ReturnType<typeof setInterval> | null = null;
this.timer = setInterval(() => {
  this.runArchivalCycle().catch((err) => {
    logger.error('Archival cycle failed:', err);
  });
}, CHECK_INTERVAL_MS);
```

[44][52]

This pattern repeats identically in `HealthMonitorService` [3], `PRWatcherService`, `GitHubMonitor`, `DiscordMonitor`, `WorktreeLifecycleService`, `SensorRegistryService`, `PeerMeshService` [16], `AgentManifestService`, `LeadEngineerService` [15], `SpecGenerationMonitor`, and `WorkIntakeService` [1].

**LeadEngineerService** is the most aggressive multiplier — each active project spawns **3 intervals**:

```typescript
// FILE: apps/server/src/services/lead-engineer-service.ts:332–384
this.refreshIntervals.set(
  projectPath,
  setInterval(async () => {
    /* world state */
  }, WORLD_STATE_REFRESH_MS)
);
this.supervisorIntervals.set(
  projectPath,
  setInterval(() => {
    /* supervisor */
  }, SUPERVISOR_CHECK_MS)
);
this.prMergeIntervals.set(
  projectPath,
  setInterval(() => {
    /* merge poll */
  }, PR_MERGE_POLL_MS)
);
```

[2][15]

Timer count scales linearly with projects, making this the highest-growth source of unmanaged intervals.

**PeerMeshService** maintains 3 infrastructure-critical timers (reconnect, heartbeat, TTL) [16]:

```typescript
// FILE: apps/server/src/services/peer-mesh-service.ts:670, 856, 908
this.reconnectTimer = setInterval(() => { /* ws reconnect */ }, ...);
this.heartbeatTimer = setInterval(() => {
  const beat: SyncMessage = { type: 'heartbeat', ...this._peerFields() };
}, intervalMs);
this.ttlTimer = setInterval(() => {
  for (const [id, peer] of this.peers.entries())
    if (now - lastSeen > ttl) peer.identity.status = 'offline';
}, ...);
```

[16]

**SchedulerService** itself is just another `setInterval` consumer:

```typescript
// FILE: apps/server/src/services/scheduler-service.ts:790
this.intervalId = setInterval(() => {
  void this.tick();
}, this.checkInterval);
```

[8]

All interval constants are centralized in `timeouts.ts` with environment variable overrides [39][53]:

```typescript
// FILE: apps/server/src/config/timeouts.ts:1–24
/**
 * Central timeout configuration for the server.
 * Each reads from a named environment variable with a sensible default.
 */
```

[39]

This centralization of _values_ without centralization of _lifecycle management_ is the core structural gap.

### 2. Four Overlapping Board Health Systems

**System A — HealthMonitorService** runs a 5-minute background loop detecting `stuck_feature`, `retryable_feature`, `orphaned_worktree`, `high_memory_usage`, `disk_space_low`, with auto-remediation [3]:

```typescript
// FILE: apps/server/src/services/health-monitor-service.ts:177
this.intervalId = setInterval(() => {
  this.runHealthCheck().catch((error) => {
    logger.error('Periodic health check failed:', error);
  });
}, this.config.checkIntervalMs);
```

[3]

**System B — FeatureHealthService** provides on-demand audits detecting `orphaned_epic_ref`, `dangling_dependency`, `stale_running`, `stale_gate`, `stale_lease`, `closed_pr_in_review`, `completed_epic_children` with dry-run and auto-fix modes [4].

**System C — API Health Routes** expose five graduated HTTP endpoints (`/quick` <10ms, `/standard` <100ms, `/deep` <2s, `/detailed`, `/ready`) plus a POST endpoint calling `FeatureHealthService.audit()` [5].

**System D — Maintenance Task `built-in:board-health`** runs every 6 hours, calling `FeatureHealthService.audit(projectPath, true)` across all projects [6][7]:

```typescript
// FILE: apps/server/src/services/maintenance-tasks.ts:679
async function runBoardHealthAudit(
  featureHealthService: FeatureHealthService,
  events: EventEmitter,
  projectPaths: string[]
): Promise<void> {
  for (const projectPath of projectPaths) {
    const report = await featureHealthService.audit(projectPath, true);
    totalIssues += report.issues.length;
    totalFixed += report.fixed.length;
  }
}
```

[6][7]

Systems A and B detect partially overlapping issue classes with different detection logic. System D duplicates System B on a fixed cadence. System C is purely synchronous. None share a unified issue taxonomy or remediation tracking.

### 3. Scheduler Architecture

`SchedulerService` is a singleton cron engine with a `Map<id, ScheduledTask>` registry, a hand-rolled 5-field cron parser, and a 60-second tick interval [8][38]. It persists task metadata to `.automaker/data/scheduled-tasks.json` [12]. It emits a rich event lifecycle (`scheduler:task_registered`, `scheduler:task_started`, `scheduler:task_completed`, `scheduler:task-failed`) [70] and tracks `executionCount`/`failureCount` per task — but none of this reaches Prometheus [70]:

```typescript
// FILE: apps/server/src/services/scheduler-service.ts:853–911
this.emitEvent('scheduler:task_started', { taskId: id, name: task.name });
try {
  await task.handler();
  task.failureCount = 0;
} catch (err) {
  task.failureCount++;
  this.emitEvent('scheduler:task-failed', { taskId: id, error });
}
const duration = Date.now() - startTime; // ← computed, never histogrammed
this.emitEvent('scheduler:task_completed', { ...result });
```

[70]

### 4. Calendar Architecture

`CalendarService` is a thin pull-based aggregation layer [9] with types `'feature' | 'milestone' | 'custom' | 'google' | 'job' | 'ceremony'` [10]. It maintains a **private** `NodeEventEmitter` for `calendar:reminder` events that does NOT share the global event bus [23]:

```typescript
// FILE: apps/server/src/services/calendar-service.ts:40
private readonly reminderEmitter = new NodeEventEmitter();

onReminder(callback: (payload: CalendarReminderPayload) => void): void {
  this.reminderEmitter.on('calendar:reminder', callback);
}
emitReminder(payload: CalendarReminderPayload): void {
  this.reminderEmitter.emit('calendar:reminder', payload);
}
```

[23][33]

This isolation means calendar reminders are invisible to the global event bus and any event-triggered automation [21][32].

### 5. Webhook Architecture

Two GitHub webhook entry points exist: `POST /webhooks/github` (HMAC-SHA256 validated) [11] and `POST /github` (pull_request, issue, issue_comment routing) [12]. Flow is stateless: HTTP → signature verify → `X-GitHub-Event` header → handler → `EventEmitter` → `PRWatcherService.triggerCheck()` [11][12]. No retry, persistence, or delivery guarantee.

### 6. Maintenance Automation

`registerMaintenanceFlows()` seeds 8 built-in tasks into `FlowRegistry` [13][20]:

| Task                    | Cadence |
| ----------------------- | ------- |
| `stale-features`        | Hourly  |
| `stale-worktrees`       | Daily   |
| `branch-cleanup`        | Weekly  |
| `data-integrity`        | 5 min   |
| `built-in:board-health` | 6h      |
| `auto-merge-prs`        | 5 min   |
| `auto-rebase-stale-prs` | 30 min  |
| `runner-health`         | 5 min   |

All marked `isBuiltIn: true` (undeleteable) and executed via the `AutomationService → SchedulerService` chain [13][17][20].

---

## Relevant Patterns & Integration Points

### Central Event Bus

The shared `EventEmitter` [18][29] is the primary integration seam:

```typescript
// FILE: apps/server/src/lib/events.ts:31
export interface EventEmitter extends EventBus {
  emit: (type: EventType, payload: unknown) => void;
  subscribe: (callback: EventCallback) => UnsubscribeFn;
  on: <T extends EventType>(type: T, callback: TypedEventCallback<T>) => UnsubscribeFn;
  setRemoteBroadcaster(fn: RemoteBroadcastFn): void;
}
```

[18][29]

It supports typed handlers, a catch-all `subscribe()`, and pluggable remote broadcasting for CRDT sync over WebSocket [45]. This is the natural integration point for a unified timer registry to emit lifecycle events.

### Scheduler Module — Primary Orchestration Layer

`scheduler.module.ts` is the sole location wiring `SchedulerService`, `AutomationService`, `CalendarService`, and `GoogleCalendarSync` [19][30]:

```typescript
// FILE: apps/server/src/services/scheduler.module.ts:28
schedulerService.initialize(events, dataDir);
schedulerService.setSettingsService(settingsService);
void schedulerService.start().then(async () => {
  await automationService.syncWithScheduler({
    events,
    autoModeService,
    featureHealthService,
    integrityWatchdogService,
    featureLoader,
    settingsService,
  });
  await schedulerService.registerTask(
    'job-executor:tick',
    'Calendar Job Executor',
    '* * * * *',
    () => container.jobExecutorService.tick(),
    true
  );
  await schedulerService.registerTask(
    'google-calendar:sync',
    'Google Calendar Sync',
    '0 */6 * * *',
    async () => {
      /* ... */
    },
    true
  );
});
```

[19][30]

### AutomationService — Event-Triggered Dispatch

The catch-all subscriber pattern routes any event bus emission to matching event-triggered automations [21][32]:

```typescript
// FILE: apps/server/src/services/automation-service.ts:511
eventsEmitter.subscribe((type: unknown, _payload: unknown) => {
  void (async () => {
    const allAutomations = await this.readAutomations();
    const matching = allAutomations.filter(
      (a) =>
        a.enabled &&
        a.trigger.type === 'event' &&
        (a.trigger as StoredEventTrigger).eventType === type
    );
    for (const automation of matching) {
      this.executeAutomation(automation.id, 'scheduler').catch(/* ... */);
    }
  })();
});
```

[21][32]

This means any new events emitted by a unified timer registry would automatically be available as automation triggers.

### AutoModeCoordinator — Cross-System State Gate

The only existing class using the event bus for cross-module behavioral coupling [25][34]:

```typescript
// FILE: apps/server/src/services/auto-mode/auto-mode-coordinator.ts:22
export class AutoModeCoordinator {
  private _pickupFrozen = false;
  constructor(events: EventEmitter, settingsService?: SettingsService | null) {
    this.events.on('error_budget:exhausted' as EventType, (data) => {
      void this._handleExhausted(data as { projectPath: string; failRate: number });
    });
    this.events.on('error_budget:recovered' as EventType, (data) => {
      void this._handleRecovered(data as { projectPath: string; failRate: number });
    });
  }
}
```

[25][34]

This pattern — event-driven behavioral gates — is the model for how unified health signals should control timer behavior.

### Wiring Topology

`registerInfrastructure()` (health) and `registerScheduler()` are separate sequential calls with no declared dependency [27]. Health and scheduler start independently with no shared coordination interface. `HealthMonitorService` is wired separately via `infrastructure.module.ts` [24][36]:

```typescript
// FILE: apps/server/src/services/infrastructure.module.ts:16
healthMonitorService.setEventEmitter(events);
```

[24][36]

### Persistence — Fully Siloed

Three independent JSON stores: `scheduled-tasks.json` (SchedulerService), `calendar.json` per project (CalendarService), `automations.json` + `automation-runs.json` (AutomationService) [12]. No shared database, queue, or Redis.

### FlowRegistry Singleton

Module-level `Map<string, FlowFactory>` shared between `AutomationService` and `maintenance-tasks.ts` [26]. Maintenance flows self-register; automations lookup factories at execution time.

### SyncWithSchedulerDeps — Existing Dependency Contract

```typescript
// FILE: apps/server/src/services/automation-service.ts:42–49
```

Already formalizes shared requirements: `EventEmitter`, `AutoModeService`, `FeatureHealthService`, `DataIntegrityWatchdogService`, `FeatureLoader`, `SettingsService` [28]. This interface is the natural extension point for injecting a `TimerRegistry` dependency.

---

## External Research

### No Third-Party Scheduler or Timer Library

`package.json` contains **zero** cron/scheduler packages [37]. All periodic work uses bare `setInterval`/`setTimeout` plus one bespoke cron parser [38]. No `node-cron`, `agenda`, `bull`, `bree`, or similar.

### OpenTelemetry — Wired but Narrowly Scoped

OTel is fully configured via `NodeSDK` with dual span processors (OTLP + Langfuse) [40][50]:

```typescript
// FILE: apps/server/src/lib/otel.ts:69–74
const sdk = new NodeSDK({
  spanProcessors: [new BatchSpanProcessor(otlpExporter as any), langfuseProcessor as any],
  instrumentations: [getNodeAutoInstrumentations()],
});
```

[40][50]

Dependencies include `@opentelemetry/sdk-node ^0.212.0`, `@opentelemetry/api ^1.9.0`, `@opentelemetry/exporter-trace-otlp-http ^0.212.0`, `@opentelemetry/auto-instrumentations-node ^0.70.1`, `@langfuse/otel ^4.6.1` [41][49].

However, OTel is **gated on Langfuse credentials** and no-ops if missing [48]:

```typescript
// FILE: apps/server/src/lib/otel.ts:31–36
if (!publicKey || !secretKey) {
  logger.warn('OTel: Skipping — LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set…');
  return;
}
```

[48]

Tracing covers only LLM provider invocations [76]. Health checks, scheduler ticks, and loop state transitions produce no spans [76].

### Prometheus — Significant Metric Gaps

10 custom metrics registered, focused on agents and HTTP [42][43][51][68]:

```typescript
// FILE: apps/server/src/lib/prometheus.ts:15–130
export const register = new Registry();
export const activeAgentsCount = new Gauge({
  name: 'active_agents_count',
  registers: [register],
});
export const agentExecutionDuration = new Histogram({
  name: 'agent_execution_duration_seconds',
  labelNames: ['feature_id', 'complexity'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400],
  registers: [register],
});
// ⚠️ No scheduler_task_duration, health_check_status, loop_state.
```

[42][68]

**Missing from Prometheus:** scheduler task execution counts/durations [70], health-check results [69], auto-loop circuit-breaker state [71], ava-cron skip rates [72], and dashboard historical data [73].

The health monitor computes duration but logs it as text only [69]:

```typescript
// FILE: apps/server/src/services/health-monitor-service.ts:270–353
const result: HealthCheckResult = {
  timestamp: new Date().toISOString(),
  metrics: { memoryUsagePercent, stuckFeatures, retryableFeatures, activeFeatures },
};
this.events.emit('health:issue-detected', { type, severity, message, metrics: result.metrics });
logger.info(`Health check: ${duration}ms`); // ← text only, no histogram
this.events.emit('health:check-completed', result);
```

[69]

The auto-loop coordinator's state is entirely memory-resident [71]:

```typescript
// FILE: apps/server/src/services/auto-mode/auto-loop-coordinator.ts:54–95
export interface LoopState {
  isPaused: boolean; // ← no Gauge
  failureTimestamps: number[]; // ← never metric
  humanBlockedCount: number; // ← never exported
}
```

[71]

### Grafana & Alerting — Blind Spots

Four dashboards cover agent performance, feature velocity, system health (node-exporter), and deploy pipeline [74]. **No scheduler queues, health-check trends, loop states, or auto-remediation visualization** [74].

Five alerting rules cover server downtime, high memory, disk, agent cost, deploy absence [75]. **Missing:** scheduler consecutive failures, stuck features, worktree orphans, circuit-breaker trips [75].

Prometheus scrapes `server:9090/metrics` every 10s [77], serving only the global `prom-client` registry [78] — meaning registry gaps directly equal dashboard gaps.

### Health Check Frameworks

No external health-check framework (`@godaddy/terminus`, `kube-probe`, etc.) is used [47]. All four health systems are bespoke.

### Event Bus — No External Broker

The event bus is a bespoke `Set`-based `EventEmitter` [45]. No RxJS, Redis, Kafka, or NATS. The `setRemoteBroadcaster` hook exists for CRDT sync but is not used for operational event distribution [45].

---

## Recommended Approach

### Phase 1: Unified Timer Registry (Foundation)

**Create `TimerRegistry` service** that replaces all 24 direct `setInterval` calls with registered, named, observable timers.

**Design:**

- Central `Map<timerId, TimerEntry>` tracking name, handler, interval, last-run, next-run, execution count, failure count, state (running/paused/stopped)
- Each service calls `timerRegistry.register({ id, name, handler, intervalMs, category })` instead of `setInterval`
- Registry owns all `setInterval`/`clearInterval` calls
- Emits `timer:started`, `timer:fired`, `timer:completed`, `timer:failed`, `timer:stopped` on the shared event bus [18]
- Integrates with existing `timeouts.ts` [39] for interval values

**Migration strategy:** Service by service, replace `private timer = setInterval(...)` with `this.timerRegistry.register(...)`. Each service retains its handler logic; only lifecycle management moves. Start with leaf services (ArchivalService [44], SensorRegistryService) before tackling LeadEngineerService [15] (per-project scaling) and PeerMeshService [16] (infrastructure-critical).

**LeadEngineerService special handling:** The per-project timer Map [15] becomes `timerRegistry.register({ id: \`le:worldstate:${projectPath}\`, ... })`, giving visibility into per-project timer counts without changing business logic.

### Phase 2: Maintenance Orchestrator (Health Consolidation)

**Merge the four health systems** into a single `MaintenanceOrchestrator`:

- Absorb `HealthMonitorService` detection logic [3] and `FeatureHealthService` audit logic [4] into a unified issue taxonomy
- Consolidate System A's 5-minute background loop and System D's 6-hour cron [6] into a single configurable schedule registered through `TimerRegistry`
- Keep API health routes [5] as thin read-only endpoints over the orchestrator's latest state
- Preserve dry-run and auto-fix modes from `FeatureHealthService` [4]

### Phase 3: Enhanced Calendar & Event Router

**Bridge CalendarService's private emitter** [23] to the global event bus so `calendar:reminder` events participate in event-triggered automations [21]. This is a single-line change (emit on both emitters) with high integration payoff.

**Formalize the event router** by extending `AutomationService`'s catch-all subscriber [32] with typed routing rules, replacing the current pattern of reading all automations from JSON on every event emission.

### Phase 4: Observability Integration

**Wire TimerRegistry to Prometheus** [42] with:

- `Histogram`: `timer_execution_duration_seconds` (labels: `timer_id`, `category`)
- `Counter`: `timer_execution_total` (labels: `timer_id`, `status: success|failure`)
- `Gauge`: `timer_active_count` (label: `category`)
- `Gauge`: `timer_state` (labels: `timer_id`, `state: running|paused|stopped`)

**Wire health orchestrator to Prometheus:**

- `Gauge`: `health_issues_detected` (labels: `type`, `severity`)
- `Counter`: `health_auto_remediation_total` (labels: `type`, `result: fixed|failed`)
- `Histogram`: `health_check_duration_seconds`

**Wire scheduler events to Prometheus** by subscribing to existing `scheduler:task_started`/`scheduler:task_completed`/`scheduler:task-failed` events [70] and recording to histograms/counters. This is pure additive — no scheduler code changes needed.

**Wire auto-loop state** [71] — export `LoopState.isPaused` and `humanBlockedCount` as Gauges.

**Add Grafana dashboards** for timer registry overview, health trends, and scheduler queue depth [74]. Add alerting rules for scheduler consecutive failures and circuit-breaker trips [75].

**OTel integration:** Add spans for timer executions and health checks. Decouple OTel initialization from Langfuse credentials [48] so operational tracing works independently of LLM tracing.

### Phase 5: Ops Dashboard

Extend `dashboard.ts` [73] to include timer registry state, health orchestrator summary, scheduler queue depth, and circuit-breaker status. Persist snapshots for historical trend visibility.

### Implementation Ordering Rationale

Phase 1 is foundational — all subsequent phases depend on centralized timer lifecycle. Phase 2 eliminates the highest-confusion overlap. Phase 4 can partially run in parallel with Phase 2 (scheduler metrics are independent of health consolidation). Phase 3 and 5 have lowest urgency and fewest dependencies.

---

## Open Questions & Risks

### Critical Risks

1. **LeadEngineerService per-project timer scaling** [15]: With N projects × 3 timers, migration must handle dynamic registration/deregistration as projects activate/deactivate. The timer registry must support `register`/`unregister` per projectPath without leaking handles.

2. **PeerMeshService timing sensitivity** [16]: Heartbeat and TTL timers are infrastructure-critical for peer presence. Any jitter introduced by a shared registry tick (vs. dedicated `setInterval`) could cause false peer-offline detection. These may need to remain as dedicated high-priority timers with registry _observation_ but not _management_.

3. **Health system consolidation — detection overlap**: Systems A [3] and B [4] detect partially overlapping issue sets with different logic. A unified taxonomy must decide authoritative detection for overlapping categories (`stuck_feature` in A vs. `stale_running` in B). Requires careful mapping before code changes.

4. **Testing surface is thin where changes are deepest**: Health tests are 71 lines (route only) [63], maintenance flow tests are 98 lines (shallow) [65], and no timer lifecycle tests exist. The two critical integration tests (`auto-mode-service.integration.test.ts` at 25KB [61], `lifecycle-cascade.integration.test.ts` at 13KB [62]) exercise boundaries that will shift.

5. **Real Date math in scheduler/calendar tests** [55][56]: Core tests use `new Date(Date.now() - 60_000)` with no `vi.useFakeTimers()`. Timer registry changes that alter execution timing could cause flaky tests. Consider migrating to fake timers as a prerequisite.

### Open Questions

1. **Should the timer registry replace `SchedulerService`'s internal tick, or sit alongside it?** The scheduler's tick [8] could be the registry's only cron-aware timer, with all others being simple intervals. Alternatively, the registry could subsume cron parsing entirely.

2. **What is the desired behavior when a timer handler exceeds its interval?** Current `setInterval` loops can stack executions if handlers are slow. The registry should likely implement skip-if-running semantics, but this changes behavior for any service relying on stacked execution.

3. **Should `CalendarService`'s private emitter** [23] be fully replaced with the global bus, or should it dual-emit? Dual-emit preserves backward compatibility; full replacement simplifies but requires auditing all `onReminder()` consumers.

4. **Persistence consolidation**: Three JSON stores [12] could remain siloed (least risk) or merge into a single operational state store (most benefit for the ops dashboard). What is the tolerance for a storage migration?

5. **OTel decoupling from Langfuse** [48]: Should operational tracing (timers, health) use a separate OTel pipeline that doesn't depend on Langfuse credentials, or should the existing pipeline be made unconditional?

6. **Coverage thresholds** [58]: Current thresholds (60% lines, 75% functions, 55% branches) with routes/middleware excluded. Should the new timer registry and maintenance orchestrator have higher thresholds given their operational criticality?

---

## Citations

| #    | Source                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1]  | `apps/server/src/services/work-intake-service.ts:121`                                                                                                                                       |
| [2]  | `apps/server/src/services/lead-engineer-service.ts:334–384`                                                                                                                                 |
| [3]  | `apps/server/src/services/health-monitor-service.ts:177` — Background `setInterval` (5 min), detects stuck_feature, retryable_feature, orphaned_worktree, high_memory_usage, disk_space_low |
| [4]  | `apps/server/src/services/feature-health-service.ts` — On-demand audit detecting orphaned_epic_ref, dangling_dependency, stale_running, etc.                                                |
| [5]  | `apps/server/src/routes/health/` — Five graduated HTTP endpoints                                                                                                                            |
| [6]  | `apps/server/src/services/maintenance-tasks.ts:679` — 6-hour `built-in:board-health` automation                                                                                             |
| [7]  | `apps/server/src/services/maintenance-tasks.ts:679`                                                                                                                                         |
| [8]  | `apps/server/src/services/scheduler-service.ts:790`                                                                                                                                         |
| [9]  | `apps/server/src/services/calendar-service.ts`                                                                                                                                              |
| [10] | `libs/types/src/calendar.ts`                                                                                                                                                                |
| [11] | `apps/server/src/routes/webhooks/routes/github.ts`                                                                                                                                          |
| [12] | `apps/server/src/routes/github/routes/webhook.ts` — Persistence: three independent JSON stores                                                                                              |
| [13] | `apps/server/src/services/maintenance-tasks.ts`                                                                                                                                             |
| [14] | `libs/flows/src/maintenance/maintenance-flow.ts`                                                                                                                                            |
| [15] | `apps/server/src/services/lead-engineer-service.ts:332–384` — Per-project 3-timer multiplication                                                                                            |
| [16] | `apps/server/src/services/peer-mesh-service.ts:670, 856, 908` — Three infrastructure timers                                                                                                 |
| [17] | `apps/server/src/services/automation-service.ts`                                                                                                                                            |
| [18] | `apps/server/src/lib/events.ts:31` — Central EventEmitter interface                                                                                                                         |
| [19] | `apps/server/src/services/scheduler.module.ts:28` — Primary orchestration wiring                                                                                                            |
| [20] | `apps/server/src/services/automation-service.ts:484` — `syncWithScheduler()` maintenance bridge                                                                                             |
| [21] | `apps/server/src/services/automation-service.ts:511` — Event-triggered automation dispatch                                                                                                  |
| [22] | `apps/server/src/services/job-executor-service.ts:70` — Calendar-to-scheduler integration                                                                                                   |
| [23] | `apps/server/src/services/calendar-service.ts:40` — Private reminder emitter                                                                                                                |
| [24] | `apps/server/src/services/infrastructure.module.ts:16` — Independent health wiring                                                                                                          |
| [25] | `apps/server/src/services/auto-mode/auto-mode-coordinator.ts:22` — Cross-system state gate                                                                                                  |
| [26] | `apps/server/src/services/automation-service.ts:37` — FlowRegistry singleton                                                                                                                |
| [27] | `apps/server/src/server/wiring.ts` — Module registration entry point                                                                                                                        |
| [28] | `apps/server/src/services/automation-service.ts:42` — `SyncWithSchedulerDeps` interface                                                                                                     |
| [29] | `apps/server/src/lib/events.ts:31` — EventEmitter interface definition                                                                                                                      |
| [30] | `apps/server/src/services/scheduler.module.ts:28` — Wiring code excerpt                                                                                                                     |
| [31] | `apps/server/src/services/automation-service.ts:484` — `syncWithScheduler()` code                                                                                                           |
| [32] | `apps/server/src/services/automation-service.ts:511` — Catch-all subscriber code                                                                                                            |
| [33] | `apps/server/src/services/calendar-service.ts:40` — Private emitter code                                                                                                                    |
| [34] | `apps/server/src/services/auto-mode/auto-mode-coordinator.ts:22` — Coordinator code                                                                                                         |
| [35] | `apps/server/src/services/job-executor-service.ts:70` — Constructor dependencies                                                                                                            |
| [36] | `apps/server/src/services/infrastructure.module.ts:16` — `setEventEmitter` call                                                                                                             |
| [37] | `apps/server/package.json:28–83` — No cron/scheduler dependencies                                                                                                                           |
| [38] | `apps/server/src/services/scheduler-service.ts:1–22` — Hand-rolled cron parser                                                                                                              |
| [39] | `apps/server/src/config/timeouts.ts:1–24` — Centralized timeout constants                                                                                                                   |
| [40] | `apps/server/src/lib/otel.ts:69–74` — NodeSDK configuration                                                                                                                                 |
| [41] | `apps/server/package.json:37–47` — OTel dependencies                                                                                                                                        |
| [42] | `apps/server/src/lib/prometheus.ts:8–21` — Prometheus registry setup                                                                                                                        |
| [43] | `apps/server/src/lib/prometheus.ts:26–131` — Custom metrics                                                                                                                                 |
| [44] | `apps/server/src/services/archival-service.ts:33, 55–59` — Timer pattern example                                                                                                            |
| [45] | `apps/server/src/lib/events.ts` — Set-based EventEmitter with remote broadcaster                                                                                                            |
| [46] | `apps/server/package.json:74` — Morgan HTTP logging                                                                                                                                         |
| [47] | `apps/server/src/services/health-monitor-service.ts`, `feature-health-service.ts` — No external health framework                                                                            |
| [48] | `apps/server/src/lib/otel.ts:31–36` — Langfuse credential gate                                                                                                                              |
| [49] | `apps/server/package.json:37–47, 74, 78` — Full OTel/Langfuse dependency list                                                                                                               |
| [50] | `apps/server/src/lib/otel.ts:69–77` — SDK initialization                                                                                                                                    |
| [51] | `apps/server/src/lib/prometheus.ts:15–21` — Registry and default metrics                                                                                                                    |
| [52] | `apps/server/src/services/archival-service.ts:33, 55–59` — Repeated timer pattern                                                                                                           |
| [53] | `apps/server/src/config/timeouts.ts:34–52` — Polling timeout constants                                                                                                                      |
| [54] | `vitest.config.ts:1` — Monorepo test project configuration                                                                                                                                  |
| [55] | `apps/server/tests/unit/services/scheduler-loop.test.ts:1` — Real Date math, no fake timers                                                                                                 |
| [56] | `apps/server/tests/unit/services/calendar-service.test.ts:1` — Real Date math                                                                                                               |
| [57] | `apps/server/tests/unit/services/agent-manifest-service.test.ts:1` — `vi.useFakeTimers()` usage                                                                                             |
| [58] | `apps/server/vitest.config.ts:1` — Coverage thresholds and exclusions                                                                                                                       |
| [59] | `apps/server/tests/setup.ts:1` — Global test setup                                                                                                                                          |
| [60] | `apps/server/tests/helpers/mock-factories.ts:1` — Mock factory infrastructure                                                                                                               |
| [61] | `apps/server/tests/integration/services/auto-mode-service.integration.test.ts:1` — 25KB integration test                                                                                    |
| [62] | `apps/server/tests/integration/services/lifecycle-cascade.integration.test.ts:1` — 13KB cascade test                                                                                        |
| [63] | `apps/server/tests/unit/routes/health.test.ts:1` — Thin health route tests (71 lines)                                                                                                       |
| [64] | `libs/types/tests/webhook.test.ts:1` — Webhook type validation tests                                                                                                                        |
| [65] | `libs/flows/tests/unit/maintenance-flow.test.ts:1` — Shallow maintenance flow tests (98 lines)                                                                                              |
| [66] | `.github/workflows/test.yml:1` — CI test pipeline                                                                                                                                           |
| [67] | `apps/ui/tests/scheduler-status-verification.spec.ts:1` — Playwright E2E scheduler test                                                                                                     |
| [68] | `apps/server/src/lib/prometheus.ts:1` — 10 custom metrics, agent/HTTP focus                                                                                                                 |
| [69] | `apps/server/src/services/health-monitor-service.ts:288` — Events emitted, no Prometheus                                                                                                    |
| [70] | `apps/server/src/services/scheduler-service.ts:534` — 11 event types, zero Prometheus                                                                                                       |
| [71] | `apps/server/src/services/auto-mode/auto-loop-coordinator.ts:54` — Memory-only loop state                                                                                                   |
| [72] | `apps/server/src/services/ava-cron-tasks.ts:26` — Three ava cron tasks, no skip metrics                                                                                                     |
| [73] | `apps/server/src/routes/dashboard.ts:24` — Point-in-time snapshot, no persistence                                                                                                           |
| [74] | `monitoring/grafana/provisioning/dashboards/` — Four dashboards, blind to schedulers/timers                                                                                                 |
| [75] | `monitoring/grafana/provisioning/alerting/rules.yml` — Five rules, no scheduler/health coverage                                                                                             |
| [76] | `libs/observability/src/langfuse/middleware.ts` — AI-only tracing                                                                                                                           |
| [77] | `prometheus.yml:24` — Scrape configuration                                                                                                                                                  |
| [78] | `apps/server/src/routes/metrics/prometheus.ts:24` — Registry-only metrics endpoint                                                                                                          |
