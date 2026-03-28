# Long-Horizon Workflows

Custom workflows become a self-driving system when combined with Ava's orchestration, cron scheduling, and cross-agent coordination. This guide explains how to set up autonomous, multi-day operational loops.

## The OODA Loop

protoLabs Studio implements a continuous improvement cycle:

```
OBSERVE          ORIENT              DECIDE              ACT
  |                |                   |                  |
Quinn monitors    Ava triages        Ava creates        Auto-mode
board, PRs, CI    signals, gaps      features with      executes via
protoResearcher   identifies          the right          custom
scans feeds       priorities          workflow           workflows
  |                |                   |                  |
  +--- results feed back into next observation cycle ----+
```

Each workflow type handles a different class of work. The board is the coordination layer -- workflow A produces a report that informs workflow B.

## Workflow Catalog

### Operational (recurring)

| Workflow            | Purpose                        | Frequency           | Model  |
| ------------------- | ------------------------------ | ------------------- | ------ |
| `audit`             | Read-only code audit           | Weekly or on-demand | Sonnet |
| `dependency-health` | CVE/outdated package scan      | Weekly              | Haiku  |
| `cost-analysis`     | Agent spend analysis           | Weekly              | Haiku  |
| `tech-debt-scan`    | TODO/deprecated/skip inventory | Bi-weekly           | Sonnet |

### Strategic (milestone-driven)

| Workflow           | Purpose                         | Trigger                 | Model  |
| ------------------ | ------------------------------- | ----------------------- | ------ |
| `strategic-review` | Progress vs goals, gap analysis | End of sprint/milestone | Opus   |
| `postmortem`       | Incident root cause analysis    | After blocked features  | Opus   |
| `research`         | Deep investigation of a topic   | On-demand               | Sonnet |

### Delivery

| Workflow           | Purpose                   | Trigger                 | Model       |
| ------------------ | ------------------------- | ----------------------- | ----------- |
| `standard`         | Full code pipeline        | Feature creation        | Sonnet/Opus |
| `content`          | GTM content creation      | Content request         | Sonnet      |
| `changelog-digest` | User-facing release notes | After promotion to main | Haiku       |
| `swebench`         | Benchmark evaluation      | On-demand               | Sonnet      |

## Composing Workflows

One workflow's output becomes another's input through the board:

```
strategic-review (Opus)
  "We're missing error handling in the webhook layer"
    |
    v
Ava creates 3 features:
  1. research: "Audit webhook error paths" (workflow: audit)
  2. code: "Add retry logic to webhook delivery" (workflow: standard)
  3. code: "Add webhook delivery tracking dashboard" (workflow: standard)
    |
    v
Auto-mode picks them up in dependency order
    |
    v
Quinn runs QA report on completed features
    |
    v
changelog-digest generates release notes
```

No explicit chaining mechanism is needed. The board is the orchestration bus.

## Scheduled Automation with Ava

Ava can create cron jobs that trigger workflows on a schedule. These run during active Ava sessions:

### Weekly Health Cycle

```
Monday 9am:    dependency-health scan
Tuesday 9am:   tech-debt-scan
Wednesday 9am: cost-analysis
Friday 4pm:    strategic-review (week in review)
```

Ava creates these as features with the appropriate workflow:

```
create_feature({
  title: "Weekly dependency health scan — week of 2026-03-28",
  workflow: "dependency-health",
  category: "dependencies",
  projectSlug: "system-health"
})
```

### Continuous Monitoring

Quinn handles continuous monitoring via her daily digest (14:00 UTC). protoResearcher handles continuous research feed scanning. Both post to Discord automatically.

For event-driven workflows, Ava responds to signals:

- Feature blocked 3+ times -> creates postmortem feature
- Sprint/milestone completes -> creates strategic-review feature
- Release promoted to main -> creates changelog-digest feature

## Self-Driving Pattern

The fully autonomous loop:

1. **Quinn observes** (daily digest, board monitoring, CI status)
2. **Ava orients** (reads Quinn's report, checks board state, reads Notes tab)
3. **Ava decides** (creates features with appropriate workflows based on what she sees)
4. **Auto-mode acts** (executes features through their workflow pipelines)
5. **Results accumulate** (trajectory store, fact store, knowledge base, QA memory)
6. **Next cycle uses accumulated knowledge** (sibling reflections, project knowledge injection)

### What Makes It Long-Horizon

Short-horizon: "Fix this bug" (one feature, one workflow, done).

Long-horizon: "Improve our webhook reliability to 99.9%" (strategic-review identifies gaps, research workflows investigate, code workflows implement, audit workflows verify, cost-analysis tracks spend, QA reports confirm improvement, strategic-review checks progress against the 99.9% target).

The system handles this through:

- **Projects with milestones** -- strategic goals decomposed into phases
- **Dependency chains** -- features execute in order
- **Workflow diversity** -- different task types use different pipelines
- **Knowledge accumulation** -- each completed feature enriches context for the next
- **Scheduled reflection** -- periodic strategic-review checks if the goal is being met

## Setting Up a Long-Horizon Goal

1. Create a project with milestones via MCP or UI
2. Set the strategic direction in Ava's Notes tab
3. Create an initial strategic-review feature to decompose the goal
4. Ava reads the review output and creates implementation features
5. Auto-mode executes them through appropriate workflows
6. Schedule periodic strategic-reviews to check progress

The system evolves its own plan as it learns from execution results.
