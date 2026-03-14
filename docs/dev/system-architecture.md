# System Architecture

The complete runtime architecture of protoLabs Studio -- from signal entry through feature completion, with all timing, concurrency, and self-healing behaviors documented.

This is the canonical reference for how the system works at runtime. For the design rationale, see [Engine Architecture](../archived/engine-architecture.md). For the 8-phase pipeline abstraction, see [Idea to Production](./idea-to-production.md).

## System Diagram

```
                              EXTERNAL SIGNALS
                    +-----------+-----------+-----------+
                    | GitHub    | Discord   | MCP       |
                    | Issues/PR | Messages  | Commands  |
                    +-----+-----+-----+-----+-----+-----+
                          |           |           |
                          v           v           v
                  +---------------------------------------+
                  |         SIGNAL INTAKE SERVICE         |
                  |  classify: ops | gtm | conversational |
                  |  intent: work_order | idea | feedback |
                  |  portfolio gate: capacity, dedup, err |
                  +------------------+--------------------+
                                     |
              +----------------------+----------------------+
              |                                             |
              v                                             v
    +---------+---------+                      +------------+----------+
    |    OPS BRANCH     |                      |     GTM BRANCH       |
    |   (Lead Engineer) |                      |   (gated, manual)    |
    +-------------------+                      |   Jon | Cindi        |
              |                                +-----------------------+
              v
    +-------------------+
    |    AUTO-MODE      |    <-- Scheduler: 2s normal / 5s capacity / 30s idle
    |   Orchestrator    |    <-- Heap guard: 80% defer, 90% abort
    |                   |    <-- Circuit breaker: 3 fails/60s -> 5min cooldown
    |   Feature         |    <-- Review queue saturation: max 5 pending
    |   Scheduler       |    <-- Error budget freeze: >30% change failure rate
    +---------+---------+
              |
              | per feature
              v
    +=========================================+
    ||     LEAD ENGINEER STATE MACHINE       ||
    ||                                       ||
    ||  INTAKE --> PLAN --> EXECUTE           ||
    ||              |         |              ||
    ||         (large/arch)   |              ||
    ||                        v              ||
    ||                     REVIEW            ||
    ||                  /    |   \           ||
    ||          approved  changes  pending   ||
    ||             |     requested  >45min   ||
    ||             v        |        |       ||
    ||           MERGE   EXECUTE  ESCALATE   ||
    ||             |     (max 4)             ||
    ||             v                         ||
    ||           DEPLOY                      ||
    ||             |                         ||
    ||             v                         ||
    ||           DONE                        ||
    ||                                       ||
    ||  ANY STATE ----> ESCALATE             ||
    +=========================================+
              |
              v
    +-------------------+     +-------------------+
    | GIT WORKFLOW      |     | MAINTENANCE       |
    | commit -> push    |     | TASKS             |
    | -> PR -> merge    |     | (8 cron jobs)     |
    +-------------------+     +-------------------+
              |
              v
    +-------------------+     +-------------------+
    | CEREMONY SYSTEM   |     | CRDT SYNC         |
    | standup | retro   |     | Multi-instance    |
    | milestone | proj  |     | Automerge mesh    |
    +-------------------+     +-------------------+
```

---

## Lead Engineer State Machine

The per-feature execution engine. Runs inside auto-mode for each dispatched feature.

### States and Transitions

```
                    +----------+
                    |  INTAKE  |
                    +----+-----+
                         |
              +----------+----------+
              |                     |
         needs plan            simple feature
        (large/arch/           (small/medium,
         3+ files)              <=2 files)
              |                     |
              v                     |
         +--------+                 |
         |  PLAN  |                 |
         +---+----+                 |
              |                     |
              +----------+----------+
                         |
                         v
                   +-----------+
            +----->|  EXECUTE  |<-----+
            |      +-----+-----+     |
            |            |            |
         changes    PR created   infra retry
        requested       |         (max 3)
         (max 4)        v
            |      +-----------+
            +------|  REVIEW   |
                   +-----+-----+
                         |
                    approved + CI
                         |
                         v
                   +-----------+
                   |   MERGE   |
                   +-----+-----+
                         |
                    PR merged
                         |
                         v
                   +-----------+
                   |  DEPLOY   |  <-- post-merge verification (120s)
                   +-----+-----+
                         |
                         v
                   +-----------+
                   |   DONE    |  (terminal)
                   +-----------+

         Any state on error:
                   +-----------+
                   | ESCALATE  |  --> classify failure --> HITL form or auto-retry
                   +-----------+
```

### State Details

| State        | Processor         | What Happens                                                                                                              | Next State                                                                             | Timeout          |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| **INTAKE**   | IntakeProcessor   | Load feature, validate deps, classify complexity, assign persona, select model, mark `in_progress`                        | PLAN (complex) or EXECUTE (simple)                                                     | --               |
| **PLAN**     | PlanProcessor     | Generate plan via LLM, validate (>100 chars), antagonistic review for large/arch                                          | EXECUTE (approved) or ESCALATE (2 retries exhausted)                                   | --               |
| **EXECUTE**  | ExecuteProcessor  | Launch agent in worktree, monitor cost ($10 budget), stream output                                                        | REVIEW (PR created) or ESCALATE (3 agent retries exhausted)                            | 30 min           |
| **REVIEW**   | ReviewProcessor   | Poll PR state every 30s: CI status, review decision, thread count                                                         | MERGE (approved+CI) or EXECUTE (changes requested, max 4) or ESCALATE (pending >45min) | 45 min pending   |
| **MERGE**    | MergeProcessor    | `gh pr merge --merge`, retry with 60s delay on failure                                                                    | DEPLOY (merged) or ESCALATE (merge fails)                                              | --               |
| **DEPLOY**   | DeployProcessor   | Verify `done` status, run `npm run typecheck` (+ `build:packages` if libs/ touched), generate reflection, save trajectory | DONE                                                                                   | 120s per command |
| **ESCALATE** | EscalateProcessor | Move to `blocked`, classify failure, create HITL form if non-retryable, save trajectory, emit signal                      | -- (terminal for cycle)                                                                | --               |

### Transition Limits

| Limit                                  | Value | Purpose                      |
| -------------------------------------- | ----- | ---------------------------- |
| Max state-to-state transitions         | 20    | Prevents infinite loops      |
| Max same-state polls (REVIEW)          | 100   | Caps polling loops           |
| Checkpoint saved after each transition | --    | Enables resume after restart |

---

## Retry Budgets

| Budget             | Limit                              | What It Counts                            | Reset              |
| ------------------ | ---------------------------------- | ----------------------------------------- | ------------------ |
| Agent retries      | 3 (`MAX_AGENT_RETRIES`)            | Full agent re-runs (compute expensive)    | Feature completion |
| Infra retries      | 3 (`MAX_INFRA_RETRIES`)            | Git push, gh CLI transient errors (cheap) | Feature completion |
| Plan retries       | 2 (`MAX_PLAN_RETRIES`)             | Plan validation/review failures           | Feature completion |
| Remediation cycles | 4 (`MAX_TOTAL_REMEDIATION_CYCLES`) | PR review changes-requested loops         | Feature completion |
| PR iterations      | 2 (`MAX_PR_ITERATIONS`)            | CodeRabbit iteration loops                | Feature completion |

### Model Escalation on Failure

| Failure Count | Model Selection                                                |
| ------------- | -------------------------------------------------------------- |
| 0             | Complexity-based (small=haiku, medium/large=sonnet, arch=opus) |
| 1             | sonnet (minimum)                                               |
| 2+            | opus (escalated)                                               |

---

## Auto-Mode Orchestrator

The scheduler that feeds features to the Lead Engineer state machine.

### Loop Tick Intervals

| Condition        | Interval | Description                              |
| ---------------- | -------- | ---------------------------------------- |
| Normal           | 2s       | Standard polling                         |
| At capacity      | 5s       | Running + starting >= maxConcurrency     |
| Idle             | 30s      | No pending features, no running agents   |
| Error            | 5s       | Error during tick                        |
| Startup cooldown | 10s      | Before first agent after auto-mode start |

### Feature Selection Algorithm

Each tick:

1. Health sweep every 50 iterations (~100s)
2. Heap check: >=80% defer, >=90% abort most recent agent
3. Count running + starting agents against `maxConcurrency`
4. Load pending features (`status === 'backlog'`, deps satisfied)
5. Filter: not running, not starting, not finished
6. Sort by priority (urgent > high > normal > low)
7. Check error budget freeze and review queue saturation
8. Dispatch to `leadEngineerService.process()`

### Dependency Resolution

Uses Kahn's algorithm (topological sort) from `@protolabsai/dependency-resolver`.

| Dependency Type                       | Completion Threshold             |
| ------------------------------------- | -------------------------------- |
| **Foundation** (`isFoundation: true`) | `done` (merged to target branch) |
| **Standard**                          | `review` (PR exists) or `done`   |

Foundation deps prevent downstream from starting on stale worktrees.

### Circuit Breaker

| Parameter         | Value | Description                             |
| ----------------- | ----- | --------------------------------------- |
| Failure window    | 60s   | Rolling window for failure counting     |
| Failure threshold | 3     | Failures within window to trigger pause |
| Cooldown period   | 5 min | Auto-resume delay after pause           |

Three failures in 60 seconds triggers a 5-minute cooldown pause, then auto-resumes.

### Capacity Constraints

| Constraint           | Default                 | Description                         |
| -------------------- | ----------------------- | ----------------------------------- |
| maxConcurrency       | 1 (configurable)        | Max agents running simultaneously   |
| Heap defer threshold | 80%                     | Stop starting new agents            |
| Heap abort threshold | 90%                     | Abort most recent agent             |
| Max review queue     | 5                       | Pause pickup when review queue full |
| Error budget freeze  | 30% change failure rate | Pause feature pickup                |

---

## Fast-Path Rules (17 Total)

Pure functions evaluated on every event. No LLM calls.

### Board Health Rules

| Rule               | Trigger                            | Condition                         | Action                                  | Timing          |
| ------------------ | ---------------------------------- | --------------------------------- | --------------------------------------- | --------------- |
| mergedNotDone      | `feature:pr-merged`                | Feature in review with prMergedAt | Move to done                            | Immediate       |
| orphanedInProgress | `feature:error`, `feature:stopped` | in_progress >4h, no agent         | Reset to backlog (block if 3+ failures) | 4h threshold    |
| staleDeps          | `feature:status-changed`           | Blocked, all deps done            | Unblock to backlog                      | Immediate       |
| staleReview        | `feature:status-changed`           | In review >30min, no auto-merge   | Enable auto-merge                       | 30min threshold |
| stuckAgent         | `lead-engineer:rule-evaluated`     | Agent running >2h                 | Abort and resume with wrap-up prompt    | 2h threshold    |
| remediationStalled | `lead-engineer:rule-evaluated`     | PR isRemediating >1h              | Reset to backlog                        | 1h threshold    |

### Auto-Mode Health Rules

| Rule            | Trigger             | Condition                                   | Action            |
| --------------- | ------------------- | ------------------------------------------- | ----------------- |
| autoModeHealth  | `auto-mode:stopped` | Backlog >0, auto-mode not running           | Restart auto-mode |
| capacityRestart | `feature:completed` | Agents < max, backlog >0, auto-mode stopped | Restart auto-mode |

### PR Management Rules

| Rule            | Trigger                             | Condition                              | Action                              |
| --------------- | ----------------------------------- | -------------------------------------- | ----------------------------------- |
| prApproved      | `pr:approved`                       | PR approved                            | Enable auto-merge + resolve threads |
| threadsBlocking | `pr:merge-blocked-critical-threads` | Critical threads blocking              | Resolve threads                     |
| missingCIChecks | `pr:missing-ci-checks`              | PR pending >30min, CI never registered | Log diagnostic                      |

### Escalation & Recovery Rules

| Rule               | Trigger                       | Condition                                         | Action                                 |
| ------------------ | ----------------------------- | ------------------------------------------------- | -------------------------------------- |
| classifiedRecovery | `escalation:signal-received`  | isRetryable + confidence >=0.7 + retryCount < max | Reset to backlog                       |
| hitlFormResponse   | `lead-engineer:hitl-response` | HITL form submitted                               | Retry / provide context / skip / close |
| rollbackTriggered  | `feature:health-degraded`     | Feature in done with health degradation           | Block + escalate for rollback          |

### Project Lifecycle Rules

| Rule                 | Trigger                  | Condition               | Action                                |
| -------------------- | ------------------------ | ----------------------- | ------------------------------------- |
| projectCompleting    | `project:completed`      | All features done       | Trigger project completion ceremony   |
| errorBudgetExhausted | Multiple                 | Budget exhausted        | Log warning, scheduler freezes pickup |
| reviewQueueSaturated | `feature:status-changed` | Review count >= max (5) | Log warning, scheduler pauses         |

---

## Agent Execution Pipeline

What happens inside EXECUTE state, from agent spawn to PR creation.

### Execution Timeline (Typical Medium Feature)

```
T+0s      executeFeature() called
T+0.5s    Load feature, validate guards, check stale context
T+1s      Create/find worktree, write lock file
T+1.5s    Pre-merge sync: git merge origin/main (abort on conflict)
T+2s      Authority check (if enabled)
T+2.5s    Status -> in_progress, emit auto_mode_feature_start
T+3s      Load context files, build prompt, assign agent role
T+3.5s    Resolve model (complexity -> haiku/sonnet/opus)
T+4s      Git sync: fetch origin, merge origin/dev
T+5s      Create Claude SDK session, invoke provider
T+6s      Stream starts, agent begins working
            |
            | Agent writes code in worktree
            | Loop detection: 8-call sliding window, 3x repeat = abort
            | Stall detection: 5min no tool_use = abort
            | Heap monitoring: every 30s, abort >90%
            | Output captured to agent-output.md (500ms debounce)
            |
T+~30m    Stream ends (or 30min timeout)
T+30.5m   Post-agent hook: recover uncommitted work if needed
T+31m     Record execution (cost, duration, tokens)
T+32m     Git workflow: commit changes
T+33m     Git workflow: rebase onto origin/dev
T+34m     Git workflow: push to remote
T+35m     Git workflow: create PR (or find existing)
T+36m     Git workflow: check PR size (non-blocking)
T+37m     Git workflow: auto-merge (if enabled, waits for CI)
T+38m     Update feature status (review/done)
T+38.5m   Emit auto_mode_feature_complete
T+39m     Schedule worktree cleanup (delayed)
```

### Model and Turn Selection

| Complexity    | Model  | Max Turns | With 1 Failure | With 2+ Failures |
| ------------- | ------ | --------- | -------------- | ---------------- |
| small         | haiku  | 200       | 300 (1.5x)     | 400 (2x)         |
| medium        | sonnet | 500       | 750            | 1000             |
| large         | sonnet | 750       | 1125           | 1500 (cap)       |
| architectural | opus   | 1000      | 1500 (cap)     | 2000 (cap)       |

### Git Workflow Steps

```
1. Commit:   git add (two-step) -> format -> git commit
2. Rebase:   git fetch origin -> git rebase origin/{baseBranch}
3. Push:     git push (--force-with-lease if rebased)
4. PR:       gh pr create --base {baseBranch} --head {branch}
5. Merge:    gh pr merge --squash (feature) or --merge (epic/promotion)
```

PR base branch resolution: feature in epic -> epic branch; epic itself -> dev; standalone -> dev.

---

## Maintenance Tasks (Cron)

Eight scheduled tasks run alongside the main loop.

| Task                         | Cron           | Interval        | What It Does                                                              |
| ---------------------------- | -------------- | --------------- | ------------------------------------------------------------------------- |
| Stale Feature Detection      | `0 * * * *`    | Hourly          | Find agents running >2h, emit alert                                       |
| Stale Worktree Cleanup       | `0 3 * * *`    | Daily 3 AM UTC  | Remove worktrees for merged branches (safety checks: clean, not current)  |
| Merged Branch Cleanup        | `0 4 * * 0`    | Weekly Mon 4 AM | Delete local branches merged to main                                      |
| Data Integrity Check         | `*/5 * * * *`  | Every 5 min     | Monitor feature dir count, CRITICAL alert on >50% drop                    |
| Board Health Reconciliation  | `0 */6 * * *`  | Every 6 hours   | Auto-fix: orphaned epics, dangling deps, stale running, stale gates       |
| Auto-Merge Eligible PRs      | `*/5 * * * *`  | Every 5 min     | Poll features in `review`, merge if all checks pass                       |
| Auto-Rebase Stale PRs        | `*/30 * * * *` | Every 30 min    | Rebase PRs behind base, auto-resolve `.automaker-lock` conflicts          |
| GitHub Actions Runner Health | `*/5 * * * *`  | Every 5 min     | Detect stuck builds >10min, cancel + retrigger; alert on >50% utilization |

### Ava Cron Tasks

| Task                   | Cron           | Description                                                      |
| ---------------------- | -------------- | ---------------------------------------------------------------- |
| ava-daily-board-health | `0 9 * * *`    | Daily 9 AM -- check stale features, blocked agents, failing CI   |
| ava-pr-triage          | `0 */4 * * *`  | Every 4 hours -- scan CodeRabbit threads, CI failures, conflicts |
| ava-staging-ping       | `*/30 * * * *` | Every 30 min -- heartbeat to Ava Channel, report if quiet >2h    |

---

## Ceremony System

### Ceremony State Machine

```
awaiting_kickoff
    | (project:lifecycle:launched)
    v
milestone_active
    | (milestone:completed)
    v
milestone_retro
    | (retro fired + remaining milestones > 0)
    +-------> milestone_active  (loop)
    |
    | (retro fired + no remaining milestones)
    v
project_retro
    | (project retro fired)
    v
project_complete  (terminal)
```

### Ceremony Types and Timing

| Ceremony            | Trigger                                    | Cadence                  | Default Cron               | Duration                          |
| ------------------- | ------------------------------------------ | ------------------------ | -------------------------- | --------------------------------- |
| **Standup**         | Registered on `project:lifecycle:launched` | Configurable per-project | `0 9 * * 1` (Mon 9 AM UTC) | ~30s LLM                          |
| **Milestone Retro** | `milestone:completed` event                | On-demand (automatic)    | --                         | ~60s LLM + Discord post           |
| **Project Retro**   | `project:completed` event                  | On-demand (automatic)    | --                         | ~90s LLM + Discord post + archive |

### Ceremony Artifacts

Saved to `.automaker/projects/{slug}/artifacts/`:

```
artifacts/
  index.json              # Type, timestamp, filename
  ceremony-report/        # Standup and retro reports
  research-report/        # Deep research outputs
  changelog/              # Changelog entries
  escalation/             # Escalation events with context
  standup/                # Standup artifacts
```

Timeline entries (append-only): `.automaker/projects/{slug}/timeline.json`

---

## CI/CD Pipeline

### Required Checks by Branch

| Workflow                                                      | dev               | staging  | main     |
| ------------------------------------------------------------- | ----------------- | -------- | -------- |
| checks.yml (format, lint, typecheck, audit, Dockerfile)       | Required          | Required | Required |
| test.yml (package tests, server tests)                        | Runs but optional | Required | Required |
| promotion-check.yml (source branch = staging, version bumped) | --                | --       | Required |

### checks.yml Sequence

1. `npm run format:check` -- Prettier
2. `npm run lint:ui` -- ESLint (React/UI)
3. `npm run lint:server` -- ESLint (server, import safety)
4. `npm run build:packages` -- Compile `@protolabsai/*`
5. `npm run typecheck` -- Full TypeScript (UI + server)
6. `npm audit --audit-level=high` -- Dependency scan (continue-on-error)
7. Dockerfile validation -- all `libs/*/package.json` have `COPY` entries

### Release Flow

```
1. Bump version on staging:
   gh workflow run prepare-release.yml --ref staging

2. Promote staging to main:
   gh pr create --base main --head staging --title "Promote vX.Y.Z"
   gh pr merge N --merge --auto

3. Auto-release (automatic on merge):
   - Read version from package.json
   - Create git tag + GitHub Release
   - Sync main back to staging + dev
```

### Deploy Pipeline

| Event           | Workflow           | Steps                                                               |
| --------------- | ------------------ | ------------------------------------------------------------------- |
| Push to staging | deploy-staging.yml | Build Docker -> deploy -> health check                              |
| Push to main    | deploy-main.yml    | Drain -> build Docker -> deploy -> e2e tests -> rollback on failure |

---

## Event System

### Core Event Bus

```typescript
events.emit(type, payload); // Local subscribers only
events.broadcast(type, payload); // Local + remote (CRDT sync mesh)
```

**CRDT-synced events** (use `broadcast()`): `project:created`, `project:updated`, `project:deleted`, `categories:updated`, `job:*`, `settings:updated`

**Local-only events** (use `emit()`): All feature events, agent events, escalation events

### Key Event Flows

```
Feature lifecycle:
  feature:created -> feature:status-changed -> feature:started ->
  feature:output -> feature:completed | feature:error | feature:stopped

PR lifecycle:
  pr:created -> pr:approved | pr:ci-failure ->
  pr:remediation-started -> pr:merged

Project lifecycle:
  project:created -> project:updated -> milestone:completed ->
  project:completed

Auto-mode:
  auto-mode:started -> auto_mode_feature_start ->
  auto_mode_feature_complete -> auto-mode:stopped | auto-mode:idle

  Note: TypedEventBus performs dual emission for auto_mode_* events — each event
  is emitted both as an 'auto-mode:event' envelope (for WebSocket streaming) and
  as a direct type (e.g. auto_mode_stopped → 'auto-mode:stopped') for internal
  subscribers such as Lead Engineer fast-path rules.

Escalation:
  escalation:signal-received -> escalation:acknowledged
```

### WebSocket Streaming

Two WebSocket servers:

| Endpoint           | Purpose                                | Backpressure                |
| ------------------ | -------------------------------------- | --------------------------- |
| `/api/events`      | All events JSON-streamed to UI clients | Drop events at 256KB buffer |
| `/api/terminal/ws` | PTY shell multiplexing                 | 100ms resize throttle       |

---

## Multi-Instance Coordination (CRDT Mesh)

### Architecture

Primary instance runs WebSocket sync server (port 4444). Workers connect as clients.

### Timing

| Parameter | Interval | Description                         |
| --------- | -------- | ----------------------------------- |
| Heartbeat | 15s      | Peer identity + capacity broadcast  |
| TTL check | 30s      | Remove peers without heartbeat      |
| Peer TTL  | 120s     | Time before peer is considered dead |
| Reconnect | 5s       | Worker retry on connection loss     |

### Project Assignment

- `claimPreferredProjects()` on boot (reads `proto.config.yaml`)
- `reassignOrphanedProjects()` every 60s (detect stale peers >120s)
- Three-tier feature sort: assigned projects > own unassigned > overflow

---

## Periodic Interval Tasks (setInterval)

Non-cron periodic tasks running in the server process.

| Service                   | Interval                    | Description                                            |
| ------------------------- | --------------------------- | ------------------------------------------------------ |
| Health monitor            | 5 min                       | Check stuck features (30min threshold), auto-remediate |
| Spec generation monitor   | 30s                         | Detect stalled spec regen (5min threshold), cleanup    |
| Lead Engineer world state | 5 min                       | Full rebuild of LeadWorldState                         |
| Lead Engineer supervisor  | 30s                         | Monitor active features for anomalies                  |
| PR merge poller           | 2.5 min                     | Check for merged PRs                                   |
| PR watcher                | 30s poll, 30min auto-expire | Monitor PR CI status                                   |
| Feature health audit      | ~100s (50 loop iterations)  | Board health sweep in auto-mode loop                   |
| CRDT heartbeat            | 15s                         | Peer mesh heartbeat                                    |
| CRDT TTL enforcement      | 30s                         | Evict unreachable peers                                |
| CRDT reconnect            | 5s                          | Worker reconnect to primary                            |
| Worktree drift check      | 6 hours                     | Detect phantom/orphan worktrees                        |

---

## Service Container (~65 Services)

### Service Groups

| Group                     | Count | Key Services                                                                                                                          |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Core Event Infrastructure | 2     | EventEmitter, EventStreamBuffer                                                                                                       |
| Feature & Project         | 6     | FeatureLoader, ProjectService, ProjectLifecycleService, ProjectAssignmentService, ProjectSlugResolver, ProjectPMService               |
| Agent Execution           | 4     | AgentService, AutoModeService, LeadEngineerService, WorkIntakeService                                                                 |
| Knowledge & Metrics       | 6     | KnowledgeStoreService, MetricsService, DoraMetricsService, ErrorBudgetService, LedgerService, ArchivalService                         |
| Scheduling & Automation   | 4     | SchedulerService, AutomationService, JobExecutorService, DailyStandupService                                                          |
| Multi-Instance (Hivemind) | 3     | CrdtSyncService, AvaChannelService, AvaChannelReactorService                                                                          |
| Discord                   | 4     | DiscordService, DiscordBotService, AgentDiscordRouter, NotificationRouter                                                             |
| Authority & Governance    | 6     | AuthorityService, PM/GTM/EM/ProjM Agents, AuditService                                                                                |
| Pipeline & State          | 6     | PipelineOrchestrator, PipelineCheckpointService, LeadHandoffService, FactStoreService, TrajectoryStoreService, ContextFidelityService |
| Health & Monitoring       | 4     | HealthMonitorService, FeatureHealthService, SpecGenerationMonitor, IntegrityWatchdogService                                           |
| WebSocket & Real-Time     | 4     | DevServerService, NotificationService, ActionableItemService, ActionableItemBridge                                                    |
| Settings & Context        | 4     | SettingsService, UserIdentityService, ContextAggregator, SensorRegistryService                                                        |
| Communication & Routing   | 4     | ChannelRouter, EscalationRouter, SignalIntakeService, HITLFormService                                                                 |
| Review & Feedback         | 4     | PRFeedbackService, AntagonisticReviewService, WorktreeLifecycleService, ReconciliationService                                         |

### Wiring Order

Services are wired in strict order via 15 register modules in `server/wiring.ts`:

```
1.  registerCore                  Settings, calendar, notifications, auto-mode
2.  registerEscalationChannels    Escalation routing infrastructure
3.  registerEventSubscriptions    Board reconciliation watchers
4.  registerChannelHandlers       HITL routing
5.  registerLeadEngineer          State machine + PR feedback + EM agent
6.  registerWorktreeLifecycle     Auto-cleanup + drift detection
7.  registerDiscord               Bot + event routing
8.  registerScheduler             Cron executor + task registration
9.  registerCeremony              Completion ceremonies
10. registerInfrastructure        Health monitor + Ava Gateway
11. registerProjectPm             PM Agent event sync
12. registerEventLedger           13 lifecycle events -> audit log
13. registerCrdtSync              Event bus <-> remote CRDT sync
14. registerWorkIntake            Work distribution across instances
15. registerAvaChannel            Auto-narration to private Ava Channel
```

### Startup Sequence

```
1. Settings migration (legacy Electron paths)
2. Runtime state migration (.automaker/ -> DATA_DIR)
3. CrdtSyncService.start()
4. ProjectAssignmentService.claimPreferredProjects()
5. CRDT store init (Automerge documents)
6. AvaChannelReactorService init
7. KnowledgeStoreService.initialize() for all projects
8. ProjectService.ensureBugsProject()
9. ProjectService.ensureSystemImprovementsProject()
10. AutoModeService.reconcileFeatureStates()
11. LeadEngineerService.reconcileCheckpoints()
12. WorktreeLifecycleService.prunePhantomWorktrees()
13. Crash detection (clean shutdown marker)
14. Auto-mode auto-start (if settings.autoModeAlwaysOn.enabled)
```

### Shutdown Sequence

```
1. Emit server:shutdown (200ms for WebSocket clients)
2. Write .clean-shutdown marker
3. Destroy LeadEngineerService
4. Destroy PipelineOrchestrator
5. Shutdown AutoModeService
6. Stop HealthMonitorService
7. Stop SchedulerService
8. Shutdown WorktreeLifecycleService
9. Shutdown HITLFormService
10. Stop AgentDiscordRouter
11. Stop AvaChannelReactorService
12. Shutdown CrdtSyncService
13. Dispose AgentManifestService
14. Shutdown Langfuse + OTel
15. Close HTTP server (5s force-exit timeout)
```

---

## Complete Timing Reference

### Execution Timeouts

| Parameter               | Default | Env Variable                     | Description                         |
| ----------------------- | ------- | -------------------------------- | ----------------------------------- |
| Execute timeout         | 30 min  | `EXECUTE_TIMEOUT_MS`             | Max wall-clock per agent            |
| Review pending timeout  | 45 min  | `REVIEW_PENDING_TIMEOUT_MINUTES` | Max pending review before escalate  |
| Review poll delay       | 30s     | `REVIEW_POLL_DELAY_MS`           | Sleep between CI/approval checks    |
| Merge retry delay       | 60s     | `MERGE_RETRY_DELAY_MS`           | Sleep between merge retries         |
| Post-merge verification | 120s    | --                               | Typecheck/build timeout per command |
| Stream stall detection  | 5 min   | --                               | No tool_use events = abort          |

### Auto-Mode Intervals

| Parameter                | Default | Description                      |
| ------------------------ | ------- | -------------------------------- |
| Normal tick              | 2s      | Standard polling                 |
| Capacity tick            | 5s      | At concurrency cap               |
| Idle tick                | 30s     | No pending features              |
| Startup delay            | 10s     | Before first agent               |
| Health sweep             | ~100s   | Every 50 iterations              |
| Circuit breaker cooldown | 5 min   | Auto-resume after pause          |
| Failure window           | 60s     | Rolling window for failure count |

### Lead Engineer Intervals

| Parameter           | Default | Description                    |
| ------------------- | ------- | ------------------------------ |
| World state refresh | 5 min   | Full rebuild of board snapshot |
| Supervisor check    | 30s     | Monitor active features        |
| PR merge poll       | 2.5 min | Check for merged PRs           |

### Infrastructure Intervals

| Parameter            | Default | Description              |
| -------------------- | ------- | ------------------------ |
| CRDT heartbeat       | 15s     | Peer identity broadcast  |
| CRDT TTL check       | 30s     | Remove unreachable peers |
| CRDT peer TTL        | 120s    | Time before peer is dead |
| CRDT reconnect       | 5s      | Worker retry delay       |
| Worktree drift check | 6 hours | Phantom/orphan detection |
| Health monitor       | 5 min   | Stuck feature check      |
| Spec gen monitor     | 30s     | Stalled spec cleanup     |

### Fast-Path Rule Thresholds

| Rule               | Threshold | Description                    |
| ------------------ | --------- | ------------------------------ |
| orphanedInProgress | 4 hours   | In-progress with no agent      |
| stuckAgent         | 2 hours   | Agent running without progress |
| staleReview        | 30 min    | PR in review, no auto-merge    |
| remediationStalled | 1 hour    | Remediation attempt timeout    |
| stuckFeature       | 30 min    | In-progress without activity   |

---

## Key Files

| Purpose                  | File                                                      |
| ------------------------ | --------------------------------------------------------- |
| Lead Engineer service    | `apps/server/src/services/lead-engineer-service.ts`       |
| Lead Engineer rules (17) | `apps/server/src/services/lead-engineer-rules.ts`         |
| Auto-mode service        | `apps/server/src/services/auto-mode-service.ts`           |
| Feature scheduler        | `apps/server/src/services/feature-scheduler.ts`           |
| Execution service        | `apps/server/src/services/auto-mode/execution-service.ts` |
| Git workflow service     | `apps/server/src/services/git-workflow-service.ts`        |
| Stream observer          | `apps/server/src/services/stream-observer-service.ts`     |
| Claude provider          | `apps/server/src/providers/claude-provider.ts`            |
| Dependency resolver      | `libs/dependency-resolver/src/resolver.ts`                |
| Ceremony service         | `apps/server/src/services/ceremony-service.ts`            |
| Maintenance tasks        | `apps/server/src/services/maintenance-tasks.ts`           |
| PR feedback service      | `apps/server/src/services/pr-feedback-service.ts`         |
| Signal intake service    | `apps/server/src/services/signal-intake-service.ts`       |
| Pipeline orchestrator    | `apps/server/src/services/pipeline-orchestrator.ts`       |
| Service container        | `apps/server/src/server/services.ts`                      |
| Wiring orchestrator      | `apps/server/src/server/wiring.ts`                        |
| Event emitter            | `apps/server/src/lib/events.ts`                           |
| Startup                  | `apps/server/src/server/startup.ts`                       |
| Shutdown                 | `apps/server/src/server/shutdown.ts`                      |
| Timing constants         | `apps/server/src/config/timeouts.ts`                      |
| Project types            | `libs/types/src/project.ts`                               |
| Lead Engineer types      | `libs/types/src/lead-engineer.ts`                         |
| Pipeline phase types     | `libs/types/src/pipeline-phase.ts`                        |

## Related Documentation

- [Idea to Production](./idea-to-production.md) -- 8-phase pipeline abstraction
- [Lead Engineer Pipeline](./lead-engineer-pipeline.md) -- Detailed processor logic (INTAKE, PLAN, EXECUTE)
- [Project Lifecycle](./project-lifecycle.md) -- Project-level state machine
- [Engine Architecture](../archived/engine-architecture.md) -- Design rationale ADR
- [Feature Status System](./feature-status-system.md) -- Canonical 5-status board lifecycle
- [PR Remediation Loop](./pr-remediation-loop.md) -- CI failure handling
- [Branch Strategy](./branch-strategy.md) -- Three-branch git workflow
- [Distributed Sync](./distributed-sync.md) -- Multi-instance CRDT mesh
- [Event Ledger](./event-ledger.md) -- Append-only event persistence
