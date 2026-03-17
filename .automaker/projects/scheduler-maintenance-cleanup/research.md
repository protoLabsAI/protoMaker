# Research Report: Scheduler & Maintenance Cleanup

Generated: 2026-03-17T02:54:22.479Z
Sub-topics investigated: 5
Total citations: 25
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

Now I have all the data needed. Let me write the comprehensive report.

---

# Scheduler & Maintenance Cleanup — Research Report

**Project:** `scheduler-maintenance-cleanup`
**Date:** 2026-03-16
**Goal:** Consolidate ~38 concurrent recurring timers into a clean, observable system. Migrate raw `setInterval` timers to the scheduler, delete dead code, simplify duplicated tasks, and ensure all background operations are visible in the Ops Dashboard.

---

## Summary

The Automaker server runs approximately **35 active `setInterval` timers** across 20+ service files, but only a fraction are managed through the central `SchedulerService`. The scheduler itself is well-architected — a singleton with dual timer models (cron + interval), persistence, metrics, and Ops Dashboard integration [1][2]. However, the majority of background timers are **self-managed** by individual services, invisible to the Ops Dashboard, and inconsistent in their cleanup behavior. Five module-level timers have **no cleanup path at all** and will leak on hot-reload or test teardown. No actual dead code was found, but several comments reference deprecated systems (Board Janitor, PR Maintainer crew) that should be updated. The existing test suite covers 122+ cases across 11 files, providing a solid safety net for migration work.

---

## Codebase Findings

### 1. Central Scheduler Architecture

`SchedulerService` (`apps/server/src/services/scheduler-service.ts`) is the single orchestration hub, managing two distinct timer types [1]:

- **Cron tasks** — evaluated every 60s by an internal `tick()` loop [11]
- **Interval tasks** — independent `setInterval` handles registered via `registerInterval()` [1]

```typescript
// FILE: apps/server/src/services/scheduler-service.ts ~Line 820
start() {
  this.running = true;
  this.checkIntervalHandle = setInterval(() => void this.tick(), 60_000);
}
registerInterval(id, intervalMs, handler, opts) {
  const handle = setInterval(() => void this.runIntervalTask(id), intervalMs);
  this.intervalTasks.set(id, { id, intervalMs, handle, ...opts });
}
tick() {
  const now = new Date();
  for (const [id, task] of this.tasks.entries()) {
    if (!task.enabled) continue;
    if (task.nextRun && task.nextRun <= now) void this.executeTask(id);
  }
}
```

Bootstrap occurs in `scheduler.module.ts`, which initializes, starts, syncs automations, and registers built-in crons [2]:

```typescript
// FILE: apps/server/src/services/scheduler.module.ts
export async function register(container: ServiceContainer) {
  const scheduler = getSchedulerService();
  scheduler.init(container.eventEmitter, DATA_DIR);
  await scheduler.start();
  await automationService.syncWithScheduler(scheduler);
  scheduler.registerTask('job-executor:tick', { cron: '* * * * *', handler: () => jobExecutorService.tick() });
  scheduler.registerTask('google-calendar:sync', { cron: '0 */6 * * *', handler: () => calendarService.sync() });
}
```

### 2. Task Categories & Naming Conventions

Tasks are organized by prefix convention [5][6][7][8][9]:

| Prefix | Source | Examples |
|--------|--------|----------|
| `job-executor:*` | scheduler.module.ts | `job-executor:tick` (every minute) |
| `automation:*` | AutomationService / FlowRegistry | User-defined cron automations |
| `maintenance:sweep:*` | MaintenanceOrchestrator | `critical` (5 min), `full` (6 hrs) |
| `built-in:*` | maintenance-tasks.ts | Stale features, branch cleanup, PR merge, runner health |
| `ava-*` | ava-cron-tasks.ts | Heartbeat/monitoring |

The `MaintenanceOrchestrator` delegates to `schedulerService.registerInterval()` properly [4]:

```typescript
// FILE: apps/server/src/services/maintenance-orchestrator.ts
start() {
  this.scheduler.registerInterval('maintenance:sweep:critical', 5 * 60 * 1000, () => this.runSweep('critical'));
  this.scheduler.registerInterval('maintenance:sweep:full', 6 * 60 * 60 * 1000, () => this.runSweep('full'));
}
```

### 3. Complete Raw Timer Inventory

**28 total `setInterval` calls** were identified across the codebase. Of these:

#### Properly Managed Service Timers (23 timers — have stop/cleanup methods)

| Service | File | Interval | Purpose |
|---------|------|----------|---------|
| WorktreeLifecycle | `worktree-lifecycle-service.ts:142` | 5 min | Drift detection |
| LeadEngineer (×4) | `lead-engineer-service.ts:370,397,419,450` | Configurable | World state, supervisor, PR merge, resume polling |
| PRFeedback | `pr-feedback-service.ts:212` | Configurable | PR feedback polling |
| PeerMesh (×3) | `peer-mesh-service.ts:670,856,908` | Configurable | Reconnect, heartbeat, TTL check |
| SpecGenerationMonitor | `spec-generation-monitor.ts:105` | Configurable | Spec generation monitoring |
| GitHubMonitor | `github-monitor.ts:87` | 30s default | PR polling |
| AgentManifest | `agent-manifest-service.ts:428` | Configurable | File watcher |
| DiscordMonitor (×2) | `discord-monitor.ts:118,212` | Configurable | Channel + signal polling |
| ProjectAssignment | `project-assignment-service.ts:264` | 60s | Orphan failover check |
| ArchivalService | `archival-service.ts:55` | 10 min | Archive cycle check |
| ProjM Agent | `projm-agent.ts:123` | Configurable | Feature scanning |
| EM Agent | `em-agent.ts:103` | Configurable | Ready feature scanning |
| PRWatcher | `pr-watcher-service.ts:145` | 30s default | CI status watching |
| WorkIntake | `work-intake-service.ts:121` | Configurable | Intake tick loop |
| HITLForm | `hitl-form-service.ts:66` | Configurable | Form cleanup |
| SensorRegistry | `sensor-registry-service.ts:126` | Configurable | Electron idle polling |
| PMWorldState | `pm-world-state-builder.ts:102` | 60s | World state refresh |

#### ⚠️ Unmanaged Module-Level Timers (5 timers — NO cleanup path)

| File | Line | Interval | Purpose | Risk |
|------|------|----------|---------|------|
| `routes/auth/index.ts` | 38 | 5 min | Login rate limit cleanup | Low — small Map |
| `lib/auth.ts` | 51 | 1 min | WebSocket token expiry | Low — small Map |
| `server/routes.ts` | 167 | 1 hour | Stale validation cleanup | Medium — accumulates |
| `routes/terminal/common.ts` | 65 | 5 min | Terminal token expiry | Low — small Map |
| `services/signal-dictionary-service.ts` | 76 | 5 min | Signal cooldown sweep | Low — `.unref()` called |

These are created at module load time with no stored reference, making them impossible to clear during graceful shutdown or test teardown.

#### Recursive setTimeout Patterns (3 — all properly tracked)

All in `auto-mode/execution-service.ts` — loop detection retry, git commit retry, and feature execution retry. Stored in `retryTimers` Map, cleared on completion.

### 4. Dead Code & Deprecated References

**No actual dead code found.** Analysis of `ava-cron-tasks.ts`, `maintenance-tasks.ts` (1,490 lines), and `maintenance-orchestrator.ts` revealed:

| Item | Location | Status |
|------|----------|--------|
| "PR Maintainer crew" comment | `git-workflow-service.ts:1490` | Stale comment — crew loops removed 2026-03-04 |
| "Board janitor" comments (×3) | `lead-engineer-rules.ts:38,57,110` | Historical "Absorbed from:" docs — intentional migration notes |
| "Board janitor" comment | `lead-engineer-deploy-processor.ts:56` | Stale comment — should reference Lead Engineer |
| Commented-out Discord MCP code | `maintenance-tasks.ts:956-966` | Active TODO awaiting Discord integration |
| "pr-maintainer" comment | `lead-engineer-rules.ts:201` | Historical "Absorbed from:" doc |

No references to "Beads" or "Frank cron" were found — those were fully removed.

### 5. Persistence & Settings

Task metadata persists to `/data/scheduled-tasks.json` [12]. On startup, `loadTasks()` restores state. Admin overrides (enable/disable, cron expression changes) are stored in `GlobalSettings.schedulerSettings.taskOverrides` [24].

### 6. Shutdown Sequence

`gracefulShutdown()` in `apps/server/src/server/shutdown.ts` stops the three major subsystems [10]:

```typescript
// FILE: apps/server/src/server/shutdown.ts
async function gracefulShutdown(container: ServiceContainer) {
  clearInterval(container.driftCheckInterval);
  container.schedulerService.stop();
  container.maintenanceOrchestrator.stop();
  container.healthMonitorService.stopMonitoring();
}
```

**Gap:** The 5 module-level timers and ~20 service-level timers are not stopped here. Each service has its own `stop()` method, but not all are called in the shutdown sequence.

---

## Relevant Patterns & Integration Points

### Ops Dashboard Surface

The `TimerRegistryEntry` interface [17] is the canonical contract between server and frontend:

```typescript
// FILE: libs/types/src/scheduler.ts:24-49
export interface TimerRegistryEntry {
  id: string;
  name: string;
  type: TimerType;             // 'cron' | 'interval'
  intervalMs?: number;
  expression?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  duration?: number;
  failureCount: number;
  executionCount: number;
  category: TimerCategory;
}
```

`TimerCategory` values: `'maintenance' | 'health' | 'monitor' | 'sync' | 'system'` [23].

**API Routes** (`apps/server/src/routes/ops/`) [15][16]:
- `GET /api/ops/timers` — lists all registered timers
- `POST /api/ops/timers/:id/pause` — pauses individual timer
- `POST /api/ops/timers/:id/resume` — resumes individual timer
- `POST /api/ops/timers/pause-all` / `resume-all` — bulk control

**Frontend** polls via `useTimerStatus()` every 60s [22]:

```typescript
// FILE: apps/ui/src/components/views/ops-view/use-timer-status.ts:64-82
const fetchTimers = useCallback(async () => {
  const result = await apiGet<TimersResponse>('/api/ops/timers');
  setTimers(result.timers);
}, []);
```

**Event system** emits lifecycle events on state changes [21]:

```typescript
// FILE: apps/server/src/routes/ops/routes/timers.ts:111-118
await schedulerService.disableTask(id);
events.emit('timer:paused', {
  timerId: id, timerName: task.name,
  kind: 'cron', timestamp: new Date().toISOString(),
});
```

### Metrics Aggregation

`SchedulerService.getMetrics()` returns totals, enabled/paused counts, executions, failures, and category/type breakdowns [19]. `listAll()` merges both cron and interval registries into a unified `TimerRegistryEntry[]` [18].

### MCP Tools

Two tools exist [14]: `get_scheduler_status` and `update_maintenance_task` (enable/disable/reschedule). **Gap:** No MCP tool for listing all timers or pausing/resuming — agents must use HTTP API.

### FlowRegistry (Automations)

`AutomationService` uses a singleton `FlowRegistry` (Map<flowId, FlowFactory>) [3]. User-defined automations are synced to the scheduler with `automation:` prefix at startup.

---

## External Research

No external libraries are being considered for replacement. The current custom scheduler is purpose-built and well-integrated. Key design decisions that align with industry patterns:

- **Cron evaluation via tick loop** (60s granularity) — matches lightweight embedded schedulers; avoids heavy dependencies like `node-cron` or `bull`
- **Persistence to JSON file** — appropriate for single-node deployment; would need migration to Redis/DB for multi-node
- **Singleton pattern** — standard for process-wide timer coordination
- **Category-based grouping** — enables targeted pause/resume for operational control

---

## Recommended Approach

### Phase 1: Migrate Unmanaged Module-Level Timers (5 timers)

**Priority: High.** These 5 timers have no cleanup path and are invisible to the Ops Dashboard.

1. **Wrap each in a service class** with `start()`/`stop()` methods
2. **Register via `schedulerService.registerInterval()`** with appropriate categories:
   - `auth/index.ts` rate limit cleanup → `system:auth-rate-limit-cleanup` (category: `system`)
   - `lib/auth.ts` WS token cleanup → `system:ws-token-cleanup` (category: `system`)
   - `server/routes.ts` validation cleanup → `system:validation-cleanup` (category: `system`)
   - `terminal/common.ts` token cleanup → `system:terminal-token-cleanup` (category: `system`)
   - `signal-dictionary-service.ts` cooldown sweep → `system:signal-cooldown-sweep` (category: `system`)
3. **Add to shutdown sequence** in `shutdown.ts`

### Phase 2: Register Service-Managed Timers with Scheduler (23 timers)

**Priority: Medium.** These timers work correctly but are invisible to the Ops Dashboard.

Strategy: Each service's `start()` method should call `schedulerService.registerInterval()` instead of raw `setInterval()`. The scheduler already supports this pattern (see MaintenanceOrchestrator [4]).

Recommended migration order (by operational importance):
1. **LeadEngineer (4 timers)** — core orchestration, highest value for observability
2. **GitHubMonitor + PRWatcher + PRFeedback (3 timers)** — external API calls, rate limit sensitive
3. **PeerMesh (3 timers)** — infrastructure heartbeat
4. **DiscordMonitor (2 timers)** — communication channel
5. **Remaining services** — lower frequency, lower risk

### Phase 3: Update Stale Comments & Dead References

**Priority: Low.** No functional dead code exists, but 4 comments reference deprecated systems:
- Update "PR Maintainer crew" → "operational tracking" in `git-workflow-service.ts:1490`
- Update "board janitor" → "Lead Engineer" in `lead-engineer-deploy-processor.ts:56`
- Preserve "Absorbed from:" comments in `lead-engineer-rules.ts` (intentional migration docs)
- Decide on commented-out Discord MCP code in `maintenance-tasks.ts:956-966` (keep as TODO or remove)

### Phase 4: Extend Ops Dashboard & MCP

1. **New `TimerCategory` values** — add `'auth'` or expand `'system'` to cover newly registered timers
2. **MCP tool enhancement** — add `list_all_timers` and `pause_timer`/`resume_timer` tools so agents have parity with the HTTP API
3. **Dashboard grouping** — frontend `TimerPanel` already groups by category [22]; new categories will auto-appear

### Testing Strategy

The existing test suite provides strong coverage:
- **11 test files, 122+ test cases, 3,000+ lines** of test code
- `scheduler-timer-registry.test.ts` (20 cases) covers `registerInterval`, `listAll`, `pauseAll/resumeAll`, `getMetrics` — directly validates migration targets
- `timer-registry-integration.test.ts` (4 cases) verifies cross-service registration patterns
- `ops/timers.test.ts` (12 cases) covers API endpoints
- 7 maintenance check test files cover individual sweep checks

**For migration work:**
- Use `vi.useFakeTimers()` (established pattern in existing tests)
- Add integration tests verifying each migrated service appears in `schedulerService.listAll()`
- Extend `timer-registry-integration.test.ts` with cases for newly registered services
- Vitest config: v8 coverage provider, 60%+ lines threshold, mock reset enabled

---

## Open Questions & Risks

1. **Service initialization order** — Migrating timers to `schedulerService.registerInterval()` requires the scheduler to be initialized first. Services that start before the scheduler module's `register()` call will need deferred registration or a startup hook. Verify the boot sequence in `apps/server/src/server/services.ts`.

2. **Hot-reload behavior** — Module-level timers in `routes/auth/index.ts` and `lib/auth.ts` will fire duplicate intervals on HMR if the dev server uses module replacement. Migrating to the scheduler fixes this (idempotent registration by ID).

3. **Timer count inflation** — Moving 28 timers into the scheduler's `listAll()` output will change the Ops Dashboard from showing ~8 timers to ~36. The frontend `TimerPanel` may need pagination or collapsible category groups.

4. **Interval precision** — The scheduler's cron tick has 60s granularity [11]. Services with sub-minute intervals (e.g., `auto-mode/execution-service.ts` 15s heartbeat) must remain as interval tasks, not cron tasks.

5. **Test isolation** — Services that currently create timers in constructors (e.g., `signal-dictionary-service.ts`) will need constructor refactoring to accept an injected scheduler, or lazy initialization on `start()`.

6. **Missing interface schemas** — The full `ScheduledTask` and `IntervalTask` internal interfaces were not captured in research. These should be reviewed before defining migration patterns to ensure all metadata fields (e.g., `retryPolicy`, `timeout`) are preserved.

7. **Multi-node future** — Current persistence is file-based (`/data/scheduled-tasks.json`) [12]. If the platform moves to multi-node, timer deduplication will need a distributed lock or leader election. This cleanup should not introduce patterns that make that harder.

---

## Citations

| # | Source | Description |
|---|--------|-------------|
| [1] | `apps/server/src/services/scheduler-service.ts:1-1223` | SchedulerService — singleton hub with dual timer model (cron + interval) |
| [2] | `apps/server/src/services/scheduler.module.ts:1-114` | Bootstrap: `register()` initializes scheduler, syncs automations, registers built-in crons |
| [3] | `apps/server/src/services/automation-service.ts:113-136` | FlowRegistry singleton — Map<flowId, FlowFactory> for user-defined automations |
| [4] | `apps/server/src/services/maintenance-orchestrator.ts:1-236` | Two-tier maintenance sweeps (critical 5min, full 6hrs) via `registerInterval()` |
| [5] | `apps/server/src/services/scheduler.module.ts:55` | `job-executor:*` task prefix |
| [6] | `apps/server/src/services/automation-service.ts:36` | `automation:*` task prefix |
| [7] | `apps/server/src/services/maintenance-orchestrator.ts:80,92` | `maintenance:sweep:*` task prefix |
| [8] | `apps/server/src/services/maintenance-tasks.ts:137-193` | `built-in:*` task prefix — stale features, branch cleanup, PR merge, runner health |
| [9] | `apps/server/src/services/ava-cron-tasks.ts:333-385` | `ava-*` task prefix — heartbeat/monitoring |
| [10] | `apps/server/src/server/shutdown.ts:21-98` | `gracefulShutdown()` — stops scheduler, orchestrator, health monitor |
| [11] | `apps/server/src/services/scheduler-service.ts:850-878` | `tick()` — 60s cron evaluation heartbeat |
| [12] | `apps/server/src/services/scheduler-service.ts:376,407-480` | Persistence to `/data/scheduled-tasks.json`, `loadTasks()` restore |
| [13] | `apps/server/src/server/services.ts` | `driftCheckInterval` — raw setInterval outside scheduler |
| [14] | `packages/mcp-server/src/tools/scheduler-tools.ts:1-42` | MCP tools: `get_scheduler_status`, `update_maintenance_task` |
| [15] | `apps/server/src/routes/ops/index.ts` | Ops API route registration |
| [16] | `apps/server/src/routes/ops/routes/timers.ts:28-39` | `GET /api/ops/timers` endpoint |
| [17] | `libs/types/src/scheduler.ts:24-49` | `TimerRegistryEntry` interface — canonical timer contract |
| [18] | `apps/server/src/services/scheduler-service.ts:1080-1110` | `listAll()` — merges cron + interval registries |
| [19] | `apps/server/src/services/scheduler-service.ts:1173-1200` | `getMetrics()` — aggregated timer statistics |
| [20] | `apps/server/src/services/scheduler-service.ts:104-110` | `TaskExecutionResult` — per-run capture |
| [21] | `apps/server/src/routes/ops/routes/timers.ts:113-118, 147-152` | Lifecycle events: `timer:paused`, `timer:resumed`, `timer:all-paused` |
| [22] | `apps/ui/src/components/views/ops-view/use-timer-status.ts:56-168` | Frontend `useTimerStatus()` polling hook (60s) |
| [23] | `libs/types/src/scheduler.ts:11` | `TimerCategory` enum values |
| [24] | `apps/server/src/services/scheduler-service.ts:729-752` | Admin overrides via `GlobalSettings.schedulerSettings.taskOverrides` |
| [25] | `apps/server/src/routes/ops/routes/deliveries.ts` | Event delivery tracking endpoint |