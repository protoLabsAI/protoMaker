# Project lifecycle

The board is the single source of truth for project state. Projects flow from idea to completion through a state machine managed by project statuses and labels.

## State machine

```
idea           → User expanding the idea
idea-approved  → PRD being generated/reviewed
prd-approved   → Milestones created, ready to launch
started        → Lead Engineer active, auto-mode running, agents implementing
completed      → All features done
```

### Relationship to features and milestones

A project decomposes into milestones, which decompose into phases, which become board features:

```
Project
├── Milestone 1 (epic feature on board)
│   ├── Phase 1.1 (board feature, isFoundation: true)
│   ├── Phase 1.2 (board feature, depends on 1.1)
│   └── Phase 1.3 (board feature, depends on 1.2)
├── Milestone 2 (epic feature on board)
│   ├── Phase 2.1 (board feature, depends on Milestone 1 epic)
│   └── Phase 2.2 (board feature, depends on 2.1)
└── ...
```

**Key rules:**

- Only one milestone executes at a time (sequential milestones)
- Phase 1 of each milestone is `isFoundation: true` — downstream phases wait for it to merge to main
- Features within a milestone can run in parallel if their dependencies allow
- Epic features aggregate child feature PRs into a single branch targeting main

### Choosing `maxConcurrency`

Set `maxConcurrency` based on the **widest parallel band** in your dependency graph — adding more slots than that just leaves agents idle.

**Linear chain** (most projects): each phase depends on the previous one, so only one agent can run at a time regardless of concurrency. Set `maxConcurrency: 2` — one active agent, one slot to pick up the next unlocked feature the moment a PR merges.

```
Phase 1 → Phase 2 → Phase 3   (only 1 runs at a time, 2nd slot is standby)
```

**Wide fan-out** (e.g. multiple independent UI components): phases can run in parallel. Set `maxConcurrency` equal to the number of simultaneously-unblocked features.

```
Phase 1 → Phase 2a   (2a and 2b unblock together)
        → Phase 2b   → use maxConcurrency: 3
```

**Mixed milestones**: use the widest fan-out across all milestones. A value of 2–3 covers most real projects without risking the 13-agent crash threshold.

**System constraint**: Do not exceed 6 concurrent agents in production (Opus ~6GB each, Sonnet ~4GB). Setting `maxConcurrency` above your dependency width doesn't increase throughput — it just pre-warms slots.

### Relationship to the pipeline

The project lifecycle operates at the **project level**. The [9-phase pipeline](./idea-to-production.md) operates at the **feature level**. They connect at these points:

| Project lifecycle state | Pipeline phases triggered      |
| ----------------------- | ------------------------------ |
| `idea`                  | TRIAGE, RESEARCH               |
| `idea-approved`         | SPEC, SPEC_REVIEW              |
| `prd-approved`          | DESIGN, PLAN                   |
| `started`               | EXECUTE, VERIFY, PUBLISH       |
| `completed`             | (terminal — all features done) |

## MCP tools

| Tool                     | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `process_idea`           | LangGraph flow to validate idea with optional HITL gate            |
| `initiate_project`       | Dedup check + create project + write idea doc                      |
| `generate_project_prd`   | Check for existing PRD, suggest generation if missing              |
| `approve_project_prd`    | Create board features from milestones                              |
| `launch_project`         | Set project to "started" + start auto-mode                         |
| `start_lead_engineer`    | Manually start Lead Engineer for a project (auto-starts on launch) |
| `get_lifecycle_status`   | Read local state, return current phase + next actions              |
| `collect_related_issues` | Move existing issues into a project                                |

### MCP tool flow

The tools are designed to be called in sequence, with human gates between steps:

```
process_idea → initiate_project → generate_project_prd → [HUMAN REVIEW] → approve_project_prd → launch_project
```

Each tool checks prerequisites and returns clear error messages if called out of order. The `/plan-project` skill wraps this entire flow with interactive prompts.

## Skill

Use `/plan-project <idea>` to run the full flow with human gates at each step.

## API endpoints

All endpoints are under `POST /api/projects/lifecycle/`:

| Endpoint           | Description                     | Required Input                 |
| ------------------ | ------------------------------- | ------------------------------ |
| `/initiate`        | Create project                  | `projectPath`, `title`, `goal` |
| `/generate-prd`    | Check/return PRD status         | `projectPath`, `projectSlug`   |
| `/approve-prd`     | Create features from milestones | `projectPath`, `projectSlug`   |
| `/launch`          | Start auto-mode                 | `projectPath`, `projectSlug`   |
| `/status`          | Get lifecycle phase             | `projectPath`, `projectSlug`   |
| `/collect-related` | Add issues to project           | `projectPath`, `projectSlug`   |

## Lead Engineer auto-start

When `launch_project` is called, the server emits a `project:lifecycle:launched` event. The Lead Engineer service subscribes to this event and automatically starts a production session for the project.

The Lead Engineer is **not an LLM agent** — it's a service that evaluates fast-path rules (pure functions) on every relevant event. It only invokes LLM agents when a situation exceeds what rules can handle.

**Fast-path rules** (defined in `lead-engineer-rules.ts`):

| Rule                 | What it does                                                  |
| -------------------- | ------------------------------------------------------------- |
| `mergedNotDone`      | Moves features to done when their PR is merged                |
| `orphanedInProgress` | Resets in-progress features with no running agent (>4h stale) |
| `staleDeps`          | Clears dependencies on features that are already done         |
| `autoModeHealth`     | Restarts auto-mode if it stopped unexpectedly                 |
| `staleReview`        | Enables auto-merge on PRs stuck in review (>24h)              |
| `stuckAgent`         | Sends nudge messages to agents idle >2h                       |
| `capacityRestart`    | Restarts auto-mode when capacity frees up                     |
| `projectCompleting`  | Detects when all features are done and triggers completion    |

The Lead Engineer maintains a comprehensive world state (`LeadWorldState`) refreshed every 5 minutes and on significant events.

## Mid-stream joins

The lifecycle supports joining at any phase. Call `get_lifecycle_status` first to determine where a project is:

- If project has PRD + milestones but no board features → `approve_project_prd`
- If project has board features in backlog → `launch_project`
- If project is already running → show status

This enables launching existing projects that were set up before the lifecycle flow existed.

## Content storage

| Content    | Storage location                                       |
| ---------- | ------------------------------------------------------ |
| Idea doc   | `.automaker/projects/{slug}/project.md`                |
| PRD        | `.automaker/projects/{slug}/project.json`              |
| Milestones | `.automaker/projects/{slug}/milestones/`               |
| Phases     | `.automaker/projects/{slug}/milestones/{n}/phase-*.md` |

## Project file structure

After creation, project files are organized as:

```
.automaker/projects/{project-slug}/
├── project.md           # High-level overview
├── project.json         # Full structured data (PRD, milestones, phases)
├── prd.md               # SPARC PRD document
└── milestones/
    ├── 01-{name}/
    │   ├── milestone.md
    │   ├── phase-01-{name}.md
    │   └── phase-02-{name}.md
    └── 02-{name}/
        ├── milestone.md
        └── phase-01-{name}.md
```

## Key files

| File                                                             | Purpose                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `apps/server/src/services/project-lifecycle-service.ts`          | Service orchestrating the lifecycle         |
| `apps/server/src/services/lead-engineer-service.ts`              | Lead Engineer production orchestrator       |
| `apps/server/src/services/lead-engineer-rules.ts`                | 14 fast-path rules (pure functions, no LLM) |
| `apps/server/src/routes/projects/lifecycle/`                     | Route handlers                              |
| `packages/mcp-server/plugins/automaker/commands/plan-project.md` | Skill file                                  |
| `libs/types/src/project.ts`                                      | `ProjectLifecyclePhase` type                |
| `libs/types/src/lead-engineer.ts`                                | `LeadWorldState`, session types             |

## Related documentation

- [Idea to Production](./idea-to-production.md) — The 9-phase pipeline reference (feature level)
- [Feature Status System](./feature-status-system.md) — The 6-status board lifecycle
- [PR Remediation Loop](./pr-remediation-loop.md) — CI failure handling during REVIEW
- [Engine Architecture](../archived/engine-architecture.md) — ADR for the Lead Engineer design
