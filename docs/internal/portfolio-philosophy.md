# Portfolio Operating Model

How protoLabs Studio manages multiple apps, many projects, and the attention of a single operator.

This document is the authoritative reference for portfolio-level governance, signal design, and decision rights. All dashboard, signal, and automation work should align with the principles here.

## Core Decisions

Three architectural decisions shape the entire operating model:

### 1. Single Instance, Multiple Apps

One protoLabs Studio instance manages all apps. Each app is a registered `projectPath` with its own `.automaker/` directory, features, projects, and settings. The portfolio layer aggregates across all apps.

If distributed instances exist (e.g., a teammate running their own instance), each instance must claim work to avoid conflicts. Two instances must never work on the same feature simultaneously.

**Implication:** The server knows about multiple project roots. Cross-app views query all registered paths. Per-app settings (WIP limits, trust levels, error budgets) are independent. Portfolio metrics roll up.

### 2. Exception-Gated Ritual

Ava monitors continuously. The operator reviews on cadence (daily, weekly). Ava only interrupts between rituals for things that **will get worse if waited on**.

The contract: Ava handles the continuous monitoring. The operator does focused reviews on cadence. Interruptions are reserved for genuine exceptions — not status updates, not "FYI" messages.

**Implication:** The default state of the dashboard is empty. No items in the queue means everything is working. Noise is a system failure.

### 3. Ava as Operator (Adjustable Trust)

Ava executes decisions, surfaces information, and never makes priority calls autonomously. Trust is a dial — the operator can grant more authority per-app or per-category, and pull it back at any time.

**Implication:** Ava's autonomous actions are bounded by policy. When trust is low, she queues everything. When trust is high, she handles routine decisions silently and only escalates novel ones.

---

## The Attention Problem

The primary problem this model solves is not visibility — it's **attention overload**. The operator can sort out any individual project if needed. The problem is everything competing for attention equally.

The system's job is to **silence almost everything** and surface only the few things that genuinely need a human decision.

### Signal Taxonomy

Every event in the system falls into exactly one of three categories:

| Category        | Definition                                        | Routing                            | Example                                            |
| --------------- | ------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| **Exception**   | Will get worse if you wait                        | Ava interrupts immediately         | Error budget breach, cascade failure, cost cap hit |
| **Decision**    | Needs human judgment but can wait for next ritual | Ava queues for daily/weekly review | PRD approval, architecture tradeoff, kill/continue |
| **Information** | Useful context but requires no action             | Ava logs silently                  | Feature shipped, PR merged, DORA improved          |

**Rules:**

- Ava never promotes Information to Decision unless the Signal Dictionary explicitly defines a threshold.
- Ava never promotes Decision to Exception unless the Signal Dictionary explicitly defines a threshold.
- Alert inflation (everything becoming "urgent") is a system failure that must be fixed by adjusting thresholds.

---

## Signal Dictionary

The Signal Dictionary is the contract between the operator and Ava. It defines a finite list of named signals, each with explicit thresholds for when they become a Decision or an Exception, and what Ava should do automatically.

If a condition is not in the dictionary, Ava handles it silently. If it is, the thresholds govern escalation.

### Default Signals

| Signal                  | Decision Threshold       | Exception Threshold      | Ava Auto-Action                                                  |
| ----------------------- | ------------------------ | ------------------------ | ---------------------------------------------------------------- |
| **Stale Review**        | PR in review > 48h       | PR in review > 96h       | Enable auto-merge at 30m. Ping reviewer at 48h. Escalate at 96h. |
| **Stuck Agent**         | No progress > 60min      | Stuck + 2 retries failed | Kill and re-queue at 60m. Escalate after 2 failures.             |
| **Remediation Loop**    | > 3 review cycles        | > 5 review cycles        | Pause at 3, queue Decision. Kill at 5, queue Exception.          |
| **WIP Overload**        | WIP at limit             | WIP > 2x limit           | Block intake at limit. Exception at 2x.                          |
| **Error Budget**        | > 50% burn in window     | > 80% burn in window     | Queue Decision at 50%. Freeze non-bug releases at 80%.           |
| **Cost Cap**            | Feature at 80% of cap    | Feature at 100% of cap   | Queue Decision at 80%. Kill agent at 100%.                       |
| **Project Drift**       | Milestone > 1 week late  | 2+ milestones late       | Flag project at-risk at 1 week. Exception at 2.                  |
| **CI Saturation**       | Pending jobs at limit    | Pending jobs > 2x limit  | Pause feature pickup at limit. Exception at 2x.                  |
| **Agent Failure Storm** | 3+ failures same feature | 5+ failures same feature | Block at 3 (existing). Exception at 5.                           |

### Signal Configuration

Signals are configurable per-app via workflow settings. The operator tunes thresholds based on experience — if daily reviews consistently have > 10 items, thresholds are too sensitive. If exceptions are missed, thresholds are too loose.

---

## The Trust Dial

Trust levels are set per-app. They control how much autonomous authority Ava has.

| Level | Name       | Ava's Authority                                    | Operator's Role                             |
| ----- | ---------- | -------------------------------------------------- | ------------------------------------------- |
| **0** | Manual     | Show everything, decide nothing                    | Approve all actions                         |
| **1** | Assisted   | Execute routine work, queue novel decisions        | Approve PRDs, architecture, kills (default) |
| **2** | Managed    | Manage backlog priority, auto-approve routine PRDs | Approve architecture and kill decisions     |
| **3** | Autonomous | Run fully, weekly summary only                     | Review outcomes, adjust strategy            |

**Default:** Level 1 for all apps. The operator adjusts up or down based on app maturity and risk tolerance.

**Level transitions:** The operator explicitly sets the trust level. Ava never changes her own trust level. If an app experiences repeated failures at a higher trust level, Ava surfaces this as a Decision ("recommend reducing trust for X") but does not act on it.

---

## Rituals

Cadenced reviews structured by the Action Queue, not by scanning dashboards.

### Daily Exception Review (10 minutes)

Process the Decision queue. Each item has context prepared by Ava. For each item: approve, reject, defer, or delegate. If the queue is empty, skip the review.

**Target:** 3-7 items. If consistently > 10, thresholds are too sensitive. If consistently 0 for a week, thresholds may be too loose (or everything is genuinely fine).

### Weekly Portfolio Review (30-45 minutes)

1. Review DORA trend lines across all apps (not point-in-time — direction matters).
2. Review flow health: WIP aging, cycle time distribution, review queue depth.
3. Review cost trends: cost per feature, cost per app, total burn.
4. Adjust signal thresholds if too noisy or too quiet.
5. Reprioritize across apps if needed.

### Monthly Architecture Review (60 minutes)

1. Review ADRs created since last review.
2. Identify cross-app architectural drift.
3. Review reliability posture (SLO compliance, incident patterns).
4. Strategic check: are we building the right things?

---

## Action Queue

The Action Queue is the primary interaction surface. It replaces scanning dashboards with a priority-sorted feed of items that need attention.

### Sources

The Action Queue unifies items from multiple existing systems:

- **Actionable Items** — policy approvals, gate decisions, review requests
- **Escalations** — system alerts surfaced by EscalationRouter
- **HITL Forms** — structured input requests from agents or flows
- **Signal Dictionary triggers** — threshold crossings that generate Decision or Exception items

### Presentation

```
EXCEPTIONS (0)         <-- if empty, you're fine
DECISIONS (3)          <-- daily review handles these
  [ ] Approve PRD: homeMaker sensor calibration pipeline
  [ ] Kill/continue: auth middleware rewrite (3 failures, $12.40 spent)
  [ ] Priority conflict: two apps need CI capacity this window
RECENT (5)             <-- collapsed by default, information only
  Feature shipped: DORA deployment tracking (protoMaker)
  PR merged: #2717 dev->staging
  ...
```

### Priority Rules

1. Exceptions always sort above Decisions.
2. Within a category, items sort by effective priority (urgent > high > medium > low).
3. Effective priority escalates as expiry approaches (existing ActionableItem behavior).
4. Snoozed items are hidden until their snooze expires.
5. Cross-app items interleave by priority, not grouped by app.

---

## Multi-App Architecture

### App Registration

Each app is a `projectPath` registered with the instance. Registration provides:

- Path to the app's root directory (where `.automaker/` lives)
- Display name for the portfolio view
- Trust level (defaults to 1)
- Per-app workflow settings overrides

### Cross-App Aggregation

Portfolio-level views query all registered apps and merge results:

- **Action Queue**: `/api/actionable-items/global` (already exists)
- **Portfolio Health**: Per-app health derived from metrics, rolled up to portfolio
- **DORA**: Per-app and aggregate deployment frequency, lead time, CFR
- **WIP**: Per-app and total WIP vs limits
- **Cost**: Per-app and total cost tracking

### Conflict Avoidance (Distributed Instances)

When multiple instances manage the same app:

- Features in `in_progress` are claimed by the instance that started them.
- A feature's `claimedBy` field (instance ID) prevents other instances from picking it up.
- Claim expires if the instance doesn't heartbeat within 5 minutes.
- The Action Queue surfaces conflicts as Exceptions if detected.

---

## Agent Concurrency Model

The system has a finite number of agent slots. Multi-app management requires explicit budget allocation so apps don't starve each other.

### Three-Layer Concurrency

| Layer              | Controls                                                                                 | Default                      |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------- |
| **System cap**     | Absolute ceiling across all apps. Set via `AUTOMAKER_MAX_CONCURRENCY` env var.           | 2 (dev), up to 20            |
| **Global default** | Per-app default when no override exists. Set via `settings.maxConcurrency`.              | 1                            |
| **Per-app budget** | Maximum agents for a specific app. Set via `autoModeByWorktree` or per-project settings. | Falls back to global default |

### Budget Allocation Rule

The sum of per-app budgets must not exceed the system cap. If it does, the system enforces a **fair-share** policy:

- Each app gets its configured budget up to the system cap.
- When total demand exceeds supply, apps are allocated proportionally to their configured budget.
- An app that is idle (no backlog work) releases its slots to the shared pool.

**Example:** System cap = 6. protoMaker budget = 4, homeMaker budget = 3. Total demand = 7 > 6. Allocation: protoMaker gets 4, homeMaker gets 2 (remaining capacity). If protoMaker is idle, homeMaker can use up to its full budget of 3.

### Current Implementation

Concurrency is tracked by `ConcurrencyManager` (lease-based, per-feature). Resolution in `FeatureScheduler.resolveMaxConcurrency()`:

```
explicit param > autoModeByWorktree["{projectId}::__main__"] > settings.maxConcurrency > DEFAULT(1)
```

Capped at `MAX_SYSTEM_CONCURRENCY`. Per-project counts via `getRunningCountForProject()`.

### Gap: Cross-App Budget Enforcement

Today, per-app limits are enforced independently — nothing prevents the sum from exceeding the system cap. The fix is a **global capacity gate** in the auto-loop's feature pickup path that checks total running agents across all apps before acquiring a new lease.

---

## Auto-Computed Project Health

Project health (`on-track / at-risk / off-track`) is derived from signals, not manually set.

### Health Derivation Rules

| Condition                                                                                  | Health    |
| ------------------------------------------------------------------------------------------ | --------- |
| All milestones on schedule, error budget healthy, WIP within limits                        | On track  |
| Any milestone > 1 week late, OR error budget > 50% burn, OR WIP at limit                   | At risk   |
| 2+ milestones late, OR error budget > 80% burn, OR WIP > 2x limit, OR > 3 blocked features | Off track |

Health is recomputed on every feature status change and on a 15-minute interval. Manual overrides are allowed but expire after 7 days (forcing re-evaluation).

---

## Mapping to Existing Primitives

This operating model builds on primitives that already exist in protoLabs Studio:

| Concept         | Existing Primitive                                 | Gap                                      |
| --------------- | -------------------------------------------------- | ---------------------------------------- |
| Action Queue    | `ActionableItem` with priority, snooze, expiry     | Needs unified UI as primary surface      |
| Signal routing  | `EscalationRouter` with dedup, multi-channel       | Needs Signal Dictionary config layer     |
| Trust boundary  | `TrustBoundaryConfig` in WorkflowSettings          | Needs per-app trust level (0-3 dial)     |
| HITL approval   | `HITLFormService` with JSON Schema forms           | Already wired, needs queue integration   |
| Fast-path rules | `LeadEngineerRules` (11 rules, pure functions)     | Needs portfolio-level rules added        |
| WIP limits      | `maxInProgress`, `maxInReview` in WorkflowSettings | Already enforced by execution gate       |
| Error budget    | `errorBudgetWindow/Threshold/AutoFreeze`           | Already enforced by Lead Engineer        |
| Cross-app query | `/api/actionable-items/global`                     | Needs expansion to metrics, health       |
| Project health  | `Project.health` field with statusUpdates          | Needs auto-computation from signals      |
| Notifications   | `Notification` type (simple, no priority)          | Subsumed by ActionableItem for decisions |
| Signal intake   | `SignalIntakeService` with intent classification   | Foundation for Signal Dictionary         |
