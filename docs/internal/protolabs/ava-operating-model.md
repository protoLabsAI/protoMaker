# Ava Operating Model

How Ava activates, triages, and makes decisions when managing a multi-app portfolio.

This document covers Ava's post-portfolio operating model — the behaviors and protocols that govern her work once the planning pipeline hands off to execution. For the full org stack, see [Org Architecture](../org-architecture.md). For the planning pipeline, see [Agency Overview](./agency-overview.md).

---

## Fleet-First Activation Sequence

When Ava activates (session start, wake from idle, or explicit sitrep request), she follows a fixed sequence before doing anything else.

```
1. get_portfolio_sitrep          -- pull health table across all registered apps
2. scan for RED (off-track)      -- any app with error budget >80% or 2+ milestones late
3. scan for YELLOW (at-risk)     -- any app with error budget >50% or 1 milestone late
4. drill RED apps first          -- read Lead Engineer state, blocked features, active PR status
5. drill YELLOW apps second      -- identify constraint (what is blocking flow?)
6. compose portfolio brief       -- health table + top constraint per layer
7. surface exceptions only       -- interrupt if any exception-threshold signal is active
```

Ava does not start new work until this sequence completes. Portfolio state must be known before action is taken.

### get_portfolio_sitrep

The `sitrep` skill queries all registered apps and returns:

- Feature counts by status (`backlog`, `in_progress`, `review`, `blocked`, `done`)
- WIP vs limit for each app
- Error budget burn rate
- Milestone schedule health
- Active agent count and concurrency headroom
- Cost burn for current window

**Portfolio metrics (P1 Portfolio Visibility — shipped 2026-04-07):**

`MetricsService` is now live and provides richer per-app data via `GET /api/metrics/{projectPath}`:

| Metric              | Description                                 |
| ------------------- | ------------------------------------------- |
| `avgCycleTimeMs`    | Average time from feature start to done     |
| `avgAgentTimeMs`    | Average agent execution time                |
| `avgPrReviewTimeMs` | Average PR review wait time                 |
| `totalCostUsd`      | Total cost across all features              |
| `costByModel`       | Cost breakdown by model (sonnet/opus/haiku) |
| `costPerFeature`    | Average cost per completed feature          |
| `successRate`       | Percentage of features that succeeded       |
| `throughputPerDay`  | Average features completed per day          |
| `escalationRate`    | Percentage of features that were escalated  |
| `modelDistribution` | Usage percentage by model                   |

Capacity snapshot (also live):

| Metric               | Description                          |
| -------------------- | ------------------------------------ |
| `currentConcurrency` | Features currently in progress       |
| `maxConcurrency`     | Configured concurrency ceiling       |
| `backlogSize`        | Features waiting to be started       |
| `blockedCount`       | Features currently blocked           |
| `utilizationPercent` | Current capacity utilization (0–100) |

The sitrep now incorporates this data when computing health table rows. `costByModel` and `utilizationPercent` are the two primary capacity signals Ava uses to decide whether to escalate to opus or stay on sonnet.

### Drilling Into RED/YELLOW

For each flagged app, Ava reads:

1. **Lead Engineer state** — current world state snapshot (board counts, PR statuses, agent states)
2. **Blocked features** — `statusChangeReason` for each blocked feature
3. **Active PRs** — age, CI status, CodeRabbit threads, reviewer assignment
4. **Concurrency** — is auto-mode running? are agents stuck?

The goal is to identify the **constraint** — the single thing preventing flow — not to enumerate all problems.

---

## Portfolio Briefing Format

After the activation sequence, Ava produces a portfolio brief. Format:

```
PORTFOLIO BRIEF — {date}

HEALTH TABLE
| App          | Status    | WIP   | Milestone  | Budget | Notes                    |
|--------------|-----------|-------|------------|--------|--------------------------|
| protoMaker   | on-track  | 2/4   | on-time    | 12%    |                          |
| homeMaker    | at-risk   | 3/3   | +3d late   | 51%    | WIP at limit             |
| mythxengine  | off-track | 5/4   | +9d late   | 83%    | budget breach, 3 blocked |

TOP CONSTRAINT
mythxengine: 3 features blocked on auth-middleware review (PR #47 stale 72h, no reviewer assigned).
Action: assign Quinn to review PR #47, unblock auth-middleware, unblock 3 downstream features.

EXCEPTIONS (requiring immediate action)
[ ] mythxengine error budget at 83% — freeze non-bug releases (auto-action pending approval)

DECISIONS (queue for daily review)
[ ] homeMaker WIP at limit — approve adding 1 concurrency slot or reprioritize backlog
```

This brief is the only output Ava produces at activation unless an exception requires immediate action.

---

## Cross-App Authority

Ava has explicit authority to act across all apps. These are the paths — not "contamination guards" to avoid, but explicit grants.

### What Ava may do autonomously (Trust Level 1+)

- Reassign Quinn to review a PR in any app
- Enable auto-merge on a PR in any app
- Kill a stuck agent in any app after signal thresholds are crossed
- Requeue a failed feature in any app
- Adjust WIP limits in any app (within bounds set by operator)

### What requires operator approval (Trust Level 1)

- Freeze releases in an app (error budget breach auto-action)
- Kill a feature that has spent > 80% of cost cap
- Reprioritize backlog across apps
- Change trust level for any app

### Cross-app contamination is a bug, not a feature

Cross-app authority means Ava can act on any app she is registered to manage. It does NOT mean features, worktrees, or concurrency slots bleed across app boundaries. The isolation rules in [Portfolio Philosophy](../portfolio-philosophy.md) remain absolute:

- Features live in `{projectPath}/.automaker/features/` — hard filesystem boundary
- Worktrees live in `{projectPath}/.worktrees/` — hard filesystem boundary
- Concurrency is tracked per-app by `ConcurrencyManager`

Cross-app authority is "Ava can act on App B's board" — not "App B's features can run in App A's worktrees."

---

## WSJF Triage

When the backlog has more work than capacity, Ava uses WSJF (Weighted Shortest Job First) to sequence features.

### Formula

```
WSJF = Cost of Delay / Job Duration

Cost of Delay = User/Business Value + Time Criticality + Risk Reduction
Job Duration  = estimated effort (complexity field: small=1, medium=3, large=8, architectural=13)
```

### Mapping to protoLabs Feature Schema

| WSJF Component      | Feature Field | How Ava scores it                                 |
| ------------------- | ------------- | ------------------------------------------------- |
| User/Business Value | `priority`    | urgent=4, high=3, medium=2, low=1                 |
| Time Criticality    | `dueDate`     | overdue=+3, due in 3d=+2, due in 7d=+1, no date=0 |
| Risk Reduction      | `complexity`  | architectural=+2, isFoundation=+1, else=0         |
| Job Duration        | `complexity`  | small=1, medium=3, large=8, architectural=13      |

### WSJF in Practice

Ava computes WSJF scores at each auto-mode pickup cycle. Features with higher WSJF scores are picked up first, within dependency order constraints. Features with unmet dependencies are excluded from the ranking regardless of score.

The operator can override WSJF ordering by setting `priority: urgent` on a feature — urgent features always sort to the top within their dependency tier.

---

## Capacity Allocation Authority

Ava manages concurrency allocation across apps subject to operator-configured bounds.

### Allocation Rules

1. System cap (`AUTOMAKER_MAX_CONCURRENCY`) is the absolute ceiling — never exceeded
2. Each app has a configured budget (default: 1)
3. Sum of per-app budgets may exceed system cap; fair-share applies when demand exceeds supply
4. Idle apps (no backlog work) release slots to the shared pool
5. Apps in error budget breach have their concurrency budget halved automatically

### Ava's Actions

| Condition                             | Auto-Action                                | Requires Approval |
| ------------------------------------- | ------------------------------------------ | ----------------- |
| App idle, another app has queued work | Release slot to pool                       | No                |
| App WIP at limit                      | Block new feature pickup for that app      | No                |
| App error budget >80%                 | Halve concurrency, freeze non-bug releases | Yes (Trust L1+)   |
| System cap reached                    | Block all new pickups                      | No                |
| Feature at 100% cost cap              | Kill agent, mark feature blocked           | No                |

---

## Delegation Tree

Ava delegates to agents based on signal type. This is the routing map.

```
Ava receives signal
  ├── Bug report / QA signal
  │   └── delegate to Quinn (bug_triage, pr_review, qa_report)
  │
  ├── Infrastructure / deploy signal
  │   └── delegate to Frank (infra_health, deploy, monitoring)
  │
  ├── Content request
  │   └── delegate to Cindi (blog, seo, content_review)
  │
  ├── Market / strategy question
  │   └── delegate to Jon (market_review, positioning)
  │
  ├── Research needed before planning
  │   └── delegate to Researcher (research, entity_extract)
  │       └── return to Ava for planning pipeline
  │
  ├── New project / feature idea
  │   └── Ava runs planning pipeline
  │       ├── Ava: SPARC PRD generation
  │       ├── Ava + Jon: antagonistic review
  │       └── if HITL needed: HITLRequest → originating interface
  │
  └── Portfolio health / board management
      └── Ava acts directly (sitrep, manage_feature, auto_mode)
```

### Portfolio Signals from Lead Engineer

The Lead Engineer emits portfolio-level signals that Ava monitors:

| Signal                   | Ava Action                                                  |
| ------------------------ | ----------------------------------------------------------- |
| `feature:blocked`        | Check constraint, attempt unblock, or queue Decision        |
| `project:milestone:late` | Drill app, compute WSJF, surface to operator if at-risk     |
| `agent:stuck`            | Kill and requeue (Trust L1+) or queue Exception             |
| `pr:stale`               | Assign reviewer or enable auto-merge (Trust L1+)            |
| `budget:breach`          | Freeze releases, queue Exception                            |
| `project:completed`      | Trigger reflection, generate changelog, surface to operator |
