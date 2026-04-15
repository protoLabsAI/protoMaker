# PRD: Fleet Command — GOAP Agent Fleet Management & Observability

**Version**: 1.0  
**Date**: 2026-04-07  
**Project**: protoMaker (ava)  
**Status**: Approved for scaffolding  
**Related**: [World Engine PRD](../../protoWorkstacean/docs/world-engine-prd.md)

---

## Situation

The protoMaker ops-view currently contains an `event-flow-panel` that displays raw webhook
deliveries — GitHub pushes, Discord messages, incoming webhooks — as a flat list with status
badges and retry capability. It is useful for debugging individual events but provides no
picture of the system as a whole.

The World Engine (being built as a Workstacean extension) introduces a continuous world tick,
a goal registry, a GOAP planner, cost-tracked agent dispatch, and flow metrics. All of that
activity will emit structured events to the EventBus. Without a UI layer, the autonomous
system is a black box: it acts, but you cannot see why, what it cost, or whether it's working.

The platform already has the right primitives:

- `goalGatesEnabled` in the pipeline settings — goals exist, they just aren't visible
- `adaptiveHeartbeat` — a per-project mini world-tick with board snapshot + LLM eval
- `escalationRouter` — handles HITL routing, exists but only surfaced via Discord
- `event-history-service` — full event log with persistence, just not exposed usefully
- `custom workflows` + `processorConfig` — zero-TypeScript extensibility for new agents/actions
- `WorkflowSettings` — trust boundary, budget caps, error budget, all per-project

The gap: no unified view that makes the autonomous system **legible**. No way to add new
fleet domains without writing TypeScript. No way to approve HITL requests outside Discord.
The ops-view is a webhook log, not a fleet command center.

---

## Problem

1. **Black box autonomy.** The system acts without a window into why. When World Engine
   dispatches an agent to fix a PR, there's no UI showing: goal violated → plan selected →
   cost estimated → agent dispatched → outcome. You only see effects, not causes.

2. **Locked to the protoMaker dev flow.** The current system assumes the fleet is running
   software development workflows. There is no way to add a new monitoring domain (e.g.,
   seedbox health, Grafana alerting, Discord moderation) without writing TypeScript plugins.

3. **HITL bottleneck.** Human-in-the-loop requests route only to Discord. To approve or
   reject an escalation, you must find the Discord message, read the context, and react.
   There is no in-app approval queue.

4. **Flow metrics are invisible.** Velocity, cycle time, flow efficiency, WIP, distribution
   — these exist as concepts in the workflow settings (error budget, maxPendingReviews) but
   are not computed or displayed anywhere.

5. **No extensibility surface.** Each new fleet domain (new world state source, new goal,
   new agent action type) requires a TypeScript plugin. This creates a high barrier for
   adding monitoring or automation to any system beyond protoMaker.

6. **Budget opacity.** `maxAgentCostUsd` is set per-project but there's no view of actual
   spend, tier distribution, daily totals, or projected burn rate.

---

## Approach

### Core Model

Fleet Command transforms the ops-view from a webhook log into a **mission control for the
autonomous system**. It is the window into World Engine: every world tick, goal evaluation,
planned action, agent dispatch, and outcome is visible, filterable, and actionable.

Critically, it is **not protoMaker-specific**. The extensibility model — built on top of the
existing custom workflow system — allows any team to register new world state sources, goals,
and action types through YAML configuration, without touching TypeScript.

### Extensibility via Custom Workflows

The existing `processorConfig` system (inline YAML processor config, no TypeScript needed)
becomes the extension surface for World Engine. Three new workflow types are introduced:

#### 1. World State Collector Workflow

Defines a custom world state domain. The processor runs on each tick, outputs JSON, and
the result is merged into `WorldState.extensions[domain]`.

```yaml
# .automaker/workflows/seedbox-health.yml
name: seedbox-health
type: world-state-collector
description: Monitor seedbox disk, torrent counts, and seed time compliance
tickIntervalSeconds: 60
phases:
  - state: EXECUTE
    enabled: true
    processorConfig:
      prompt: |
        Check seedbox health at cupcake.usbx.me:
        1. GET quota exporter at :9850 — parse free_bytes, used_bytes, quota_bytes
        2. Check qBittorrent API for torrents near seed time limit (< 2h remaining)
        3. Return JSON: { free_gb, used_gb, quota_gb, torrents_at_risk: [{name, time_remaining_h}] }
      tools: [Bash]
      outputFormat: json
      maxTurns: 5
```

#### 2. Goal Definition Extension

Goals for custom domains are declared in `goals.yaml` (or per-project overrides) and
reference any key in `WorldState` or `WorldState.extensions`:

```yaml
# workspace/goals.yaml (or .automaker/projects/{slug}/goals.yaml)
goals:
  - id: seedbox.disk_healthy
    priority: high
    invariant: 'extensions.seedbox-health.free_gb >= 50'
    action: alert_seedbox_disk
    agent: ava
    max_cost: tier_1
    cooldown: 30m

  - id: seedbox.no_at_risk_torrents
    priority: medium
    invariant: 'extensions.seedbox-health.torrents_at_risk.length == 0'
    action: handle_expiring_torrents
    agent: ava
    max_cost: tier_2
    cooldown: 1h
```

#### 3. Action Workflow

Defines what happens when a goal is violated. The planner selects an action workflow and
the dispatcher executes it — same execution pipeline as any other feature, but triggered
by world state rather than a human.

```yaml
# .automaker/workflows/alert-seedbox-disk.yml
name: alert-seedbox-disk
type: action
description: Alert when seedbox free space drops below 50GB
phases:
  - state: EXECUTE
    enabled: true
    processorConfig:
      prompt: |
        Seedbox free space is below threshold. 
        Check which torrents are safe to remove (BTN torrents that have met 7-day seed requirement).
        Post a Discord alert with the top candidates. Do NOT delete anything.
      tools: [Bash]
      outputFormat: text
      maxTurns: 8
execution:
  useWorktrees: false
  gitWorkflow:
    autoCommit: false
    autoPush: false
    autoCreatePR: false
  terminalStatus: done
```

This pattern makes the fleet **infinitely extensible**:

- New monitoring domain → one collector workflow YAML
- New invariant → one entry in goals.yaml
- New agent action → one action workflow YAML
- No TypeScript. No pull requests to the platform. No restarts.

### UI Architecture

The ops-view is restructured around four panels:

```
┌─────────────────────────────────────────────────────────────┐
│  FLEET COMMAND                                               │
│  ● 2 Active  ◐ 3 Violated  ✓ 14 Nominal  $3.20/$50 today   │
│  [ World State: 18s ago ]  [ Tick: healthy ]                │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────┬────────────────────┬─────────────────┐
│   GOAL REGISTRY      │   ACTIVE FLEET     │  FLOW + BUDGET  │
│                      │                    │                  │
│  CRITICAL            │  ava               │  Velocity 4/day  │
│  ● infra.healthy ✓   │  ├ M3 Planning     │  Efficiency 38%  │
│                      │  │  $0.08 · 4m32s  │  WIP 6 / lim 8  │
│  HIGH                │  └ Tier 2 (Sonnet) │  Bottleneck: CI  │
│  ✗ ci.prs_green      │                    │                  │
│    3 PRs failing     │  quinn             │  Distribution    │
│    → fix_pr_ci       │  └ Triage #3300    │  ████░ Features  │
│    L0 · est $0.008   │     $0.002 · 12s   │  ██░░░ Defects   │
│                      │                    │  █░░░░ Risks     │
│  MEDIUM              │  Budget today      │  ░░░░░ Debt      │
│  ✓ flow.eff ≥35%     │  T0  $0.00  ████   │                  │
│  ✓ auto_mode         │  T1  $0.02  ██░    │  Error Budget    │
│                      │  T2  $2.80  ███    │  CFR 8% / 20%   │
│  HITL QUEUE (1)      │  T3  $0.38  █░     │  ████████░░ ok   │
│  ⚠ Loop: #3296 ×3   │                    │                  │
│  [Approve] [Dismiss] │                    │                  │
└──────────────────────┴────────────────────┴─────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  EVENT STREAM                                                │
│  [ All ▾] [Goals] [Agents] [Budget] [Errors] [HITL]        │
│                                                              │
│  18:42:01 GOAL_VIOLATED    ci.prs_green  PR #3296 fail      │
│  18:42:03 PLAN_SELECTED    fix_pr_ci     L0 · $0.008 · ava  │
│  18:42:04 ACTION_DISPATCH  fix_pr_ci     worktree created   │
│  18:46:31 ACTION_OUTCOME   fix_pr_ci     ✓ actual $0.011    │
│  18:46:32 WORLD_TICK       ci.prs_green  re-evaluating...   │
└─────────────────────────────────────────────────────────────┘
```

### Panel Specifications

#### Goal Registry Panel

- Grouped by priority tier (critical → high → medium → low)
- Each goal shows: current status (✓/✗), last evaluated, violation count, current action in-flight
- Click violated goal → expanded view: world state value, invariant expression, active plan,
  retry count, escalation tier, full cost trail
- HITL queue surfaced inline — approve/reject without leaving the page
- Custom domain goals (from extension workflows) appear automatically alongside built-in goals

#### Active Fleet Panel

- One card per running agent: name, current feature/task, elapsed time, cost so far, tier
- Clicking an agent → full context drawer: tool calls, turn count, model, estimated completion,
  causal chain (which goal → which plan → this dispatch)
- Manual controls: pause agent, view worktree diff, bump to next tier
- Budget burndown: tier distribution bars, daily total vs cap, projected EOD spend

#### Flow + Budget Panel

- 5 Flow Framework metrics: velocity (items/day), cycle time (avg hours), efficiency (%),
  load (WIP count), distribution (feature/defect/risk/debt ratio)
- Theory of Constraints indicator: where is work accumulating? (highlighted stage)
- WIP limit vs current load indicator
- Error budget gauge (CFR over rolling window vs threshold)

#### Event Stream Panel

- Real-time SSE feed from `event-history-service`
- Tab filters: All / Goals / Agents / Budget / HITL / Errors
- Each event expandable: full payload, correlation chain (click any event → see all
  causally related events as a thread: goal → plan → dispatch → outcome)
- Source-aware icons (world_tick, goal_eval, action_dispatch, hitl_request, budget_alert)

### Extensibility Registration

Fleet Command auto-discovers extensions via the workflow registry:

```typescript
interface FleetExtension {
  domain: string; // e.g. "seedbox-health"
  displayName: string; // shown in UI
  icon?: string; // lucide icon name
  worldStateKey: string; // path in WorldState.extensions
  goals: GoalDefinition[]; // from goals.yaml for this domain
  collectorWorkflow: string; // workflow name that populates this domain
  panels?: FleetPanelConfig[]; // optional custom panel config for this domain
}
```

Registering an extension is automatic: drop a collector workflow YAML with `type: world-state-collector`
into `.automaker/workflows/`. The server scans on startup and re-scans on file change. The Fleet
Command UI picks up new domains on next page load.

---

## Results

### Success Metrics

| Metric                                         | Current                  | Target                           |
| ---------------------------------------------- | ------------------------ | -------------------------------- |
| Time to understand why an agent was dispatched | N/A (impossible)         | <10s (click goal → causal chain) |
| HITL approval latency                          | 5–30 min (Discord async) | <2 min (in-app, inline)          |
| Time to add a new monitoring domain            | Days (TypeScript plugin) | <1 hour (2 YAML files)           |
| Visibility into daily agent spend              | None                     | Real-time, by tier               |
| Flow efficiency measurement                    | Not measured             | Continuous, displayed in UI      |
| Error budget visibility                        | Not displayed            | Live gauge with CFR              |

### Qualitative Outcomes

- Josh opens Fleet Command and immediately knows: what's violated, what's being fixed, what it costs
- Any engineer can add monitoring for a new domain without touching TypeScript
- HITL approvals happen in-product, not in Discord — full context available at approval time
- The system is self-documenting: every action has a visible causal chain
- Fleet Command works for any workflow type — dev, content, ops, monitoring — not just code

---

## Constraints

### Technical

- Must extend existing `ops-view` — not a new page, a transformation of what's there
- SSE stream from `event-history-service` already exists — use it, don't replace it
- Custom workflow YAML scanning must be non-blocking and hot-reload capable
- `WorldState` schema must remain backward-compatible as extensions are added
- The three new workflow types (`world-state-collector`, `action`, built-in extended)
  must not conflict with existing `standard`/`content`/`read-only`/`audit` built-ins

### Non-Goals

- Not a Grafana replacement — Fleet Command shows fleet/agent observability, not infra metrics
- Not a general dashboarding tool — panels are fixed layout, not user-configurable drag-drop
- Not real-time sub-second — SSE stream with 1-2s delay is acceptable
- Not mobile-first — desktop-only layout acceptable for ops tooling
- Fleet Command does not replace Discord HITL — it adds an alternative channel, not a replacement

### Dependencies

- World Engine (Workstacean) — must be running for Goal Registry and Action panels to populate
- `event-history-service` — already exists, must expose new event types (world tick, goal eval, etc.)
- Custom workflow scanner — new server-side capability, small surface area
- `goals.yaml` loader — being built in World Engine M2

---

## Milestones

### Milestone 1 — Shell + Event Stream Upgrade

_Goal: Replace the webhook log with a real event stream, typed by World Engine event categories._

- **Phase 1**: Define Fleet Command event schema — typed events for `world_tick`, `goal_violated`,
  `goal_restored`, `plan_selected`, `action_dispatch`, `action_outcome`, `budget_alert`, `hitl_request`
- **Phase 2**: Emit these events from World Engine (Workstacean) via the existing event-history-service
- **Phase 3**: Redesign ops-view layout — four-panel shell, responsive breakpoints
- **Phase 4**: Upgrade event stream panel — tab filters, correlation threading, source icons, expandable payloads
- **Phase 5**: Connect SSE feed — real-time updates, connection status indicator

### Milestone 2 — Goal Registry Panel

_Goal: Make the goal system visible and HITL-actionable in-product._

- **Phase 1**: Goal registry API endpoint — serves current world state + goal evaluations
- **Phase 2**: Goal Registry panel — grouped by priority, status indicators, in-flight action display
- **Phase 3**: Goal drill-down drawer — world state value, invariant, plan, cost trail, retry count
- **Phase 4**: HITL queue inline — pending approvals with full context, approve/reject/modify
- **Phase 5**: Goal violation notifications — browser notification + badge on ops-view tab

### Milestone 3 — Active Fleet Panel

_Goal: Make running agents visible with full causal context._

- **Phase 1**: Running agents API — extends existing `/api/running-agents`, adds cost + causal chain
- **Phase 2**: Fleet panel — agent cards with tier badge, elapsed, cost, task title
- **Phase 3**: Agent detail drawer — tool calls, turn count, model, full causal chain upstream
- **Phase 4**: Manual controls — pause agent, view live worktree diff, force-escalate tier
- **Phase 5**: Budget burndown bars — tier distribution, daily total, projected EOD

### Milestone 4 — Flow + Budget Panel

_Goal: Make system throughput and spend observable._

- **Phase 1**: Flow metrics service — compute velocity, cycle time, efficiency, load, distribution
  from existing feature status history (already tracked in `statusHistory[]`)
- **Phase 2**: Bottleneck detection — Theory of Constraints: find stage with longest average queue time
- **Phase 3**: Flow panel — 5 metrics, bottleneck indicator, WIP limit gauge, distribution bars
- **Phase 4**: Error budget gauge — CFR over rolling window, burn rate, threshold indicator
- **Phase 5**: Budget panel — tier spend, daily cap, projected EOD, per-project breakdown

### Milestone 5 — Extension System

_Goal: Zero-TypeScript extensibility — any monitoring domain via YAML._

- **Phase 1**: Workflow type system — add `type` field to workflow YAML; introduce
  `world-state-collector` and `action` types alongside existing workflow types
- **Phase 2**: Workflow scanner — server-side hot-reload scanner for `.automaker/workflows/`
- **Phase 3**: Extension registry API — `/api/fleet/extensions` serves all registered domains
  with their goals, collector status, last tick time
- **Phase 4**: Extension auto-discovery in UI — Fleet Command picks up new domains on load,
  adds them to Goal Registry and Event Stream filters
- **Phase 5**: Extension SDK docs — document the full loop: collector YAML → goals.yaml →
  action YAML → Fleet Command auto-discovery

---

## Extension Examples (Shipped with M5)

Three reference extensions included in the platform to demonstrate the pattern:

### Seedbox Health Extension

```yaml
# Collector: .automaker/workflows/seedbox-health.yml
# Goal: extensions.seedbox.free_gb >= 50
# Action: .automaker/workflows/alert-seedbox-disk.yml
```

### CI Health Extension

```yaml
# Collector: reads GitHub PR status for all registered repos
# Goal: repos[*].failing_prs.length == 0
# Action: dispatches fix-pr-ci workflow
```

### Auto-Mode Extension

```yaml
# Collector: reads auto-mode status for all projects
# Goal: projects[*].auto_mode.status == "running"
# Action: restarts auto-mode (L0 deterministic, free)
```

These ship as built-in workflows that can be overridden by project-level YAML files
(same resolution order as the existing workflow system).

---

_Fleet Command is the interface between humans and the autonomous fleet.
The World Engine runs the system. Fleet Command makes the system legible._
