# Team Roles

> Canonical authority-agent roster for protoMaker.
>
> protoMaker is a **pure executor** (see CLAUDE.md "Philosophy: protoMaker Is a Pure Executor"). The only authority agents that exist in this repo live in `apps/server/src/services/authority-agents/` and run as steps in the Lead Engineer pipeline. Portfolio orchestration — the "Ava" brain, the planning pipeline, content/GTM agents, and cross-project routing — lives in **protoWorkstacean**, not here.

## Organization Chart

```text
Project Owner (Human, Trust=3)
└── Lead Engineer (service, not an agent) — production orchestration
    ├── Product Manager (PM), Trust=1 — idea research + PRD generation
    ├── Project Manager (ProjM), Trust=1 — epic decomposition + dependencies
    ├── Engineering Manager (EM), Trust=1 — assignment + capacity / WIP
    └── Research — codebase research before planning/triage
```

## Active Roster

| Agent                                       | Role                | Code    | Trust          | Reports To    | Capabilities | Exposure |
| ------------------------------------------- | ------------------- | ------- | -------------- | ------------- | ------------ | -------- |
| **Project Owner**                           | CEO & Founder       | `CTO`   | 3 (Autonomous) | —             | All          | —        |
| [Product Manager](#product-manager)         | product-manager     | `PM`    | 1 (Assisted)   | Lead Engineer | Read-only    | Internal |
| [Project Manager](#project-manager)         | project-manager     | `ProjM` | 1 (Assisted)   | Lead Engineer | Read-only    | Internal |
| [Engineering Manager](#engineering-manager) | engineering-manager | `EM`    | 1 (Assisted)   | Lead Engineer | Read-only    | Internal |
| [Research](#research)                       | research            | —       | —              | Lead Engineer | Read-only    | Internal |

> **Not in protoMaker.** "Ava" (chief-of-staff), Cindi (content-writer), Jon (gtm-specialist), and the Researcher-as-Ava-subagent are **protoWorkstacean** concepts — see [org-architecture.md](../org-architecture.md). "Board Janitor" and "PR Maintainer" are **not** agents: those behaviors were absorbed into the Lead Engineer fast-path rules (`apps/server/src/services/lead-engineer-rules.ts`). Per-project operation is driven by **Roxy**, a CLI persona (`packages/mcp-server/plugins/automaker/commands/roxy.md`), not an authority agent.

## Project Owner {#josh}

**Type:** Human
**Role:** CEO & Founder
**Trust Level:** 3 (Autonomous)

### Description

Technical architecture decisions, product vision, hands-on coding. The goal is to offload everything that isn't creative vision and deep technical work to the AI team.

---

## Product Manager {#product-manager}

**Type:** AI authority agent (`apps/server/src/services/authority-agents/pm-agent.ts`)
**Role:** product-manager (`PM`)
**Trust Level:** 1 (Assisted)
**Reports to:** Lead Engineer pipeline
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** planning, product, requirements

### Description

Picks up injected ideas, researches the codebase, and generates SPARC PRDs and epics. Runs as the PRD-generation step of the pipeline.

---

## Project Manager {#project-manager}

**Type:** AI authority agent (`apps/server/src/services/authority-agents/projm-agent.ts`)
**Role:** project-manager (`ProjM`)
**Trust Level:** 1 (Assisted)
**Reports to:** Lead Engineer pipeline
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** planning, decomposition, dependencies

### Description

Decomposes approved epics into tasks and sets dependencies. Runs as the milestone-decomposition step of the pipeline.

---

## Engineering Manager {#engineering-manager}

**Type:** AI authority agent (`apps/server/src/services/authority-agents/em-agent.ts`)
**Role:** engineering-manager (`EM`)
**Trust Level:** 1 (Assisted)
**Reports to:** Lead Engineer pipeline
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** management, assignment, capacity

### Description

Assigns ready work and enforces capacity / WIP limits and quality gates. Runs as the auto-mode orchestration step of the pipeline.

---

## Research {#research}

**Type:** AI authority agent (`apps/server/src/services/authority-agents/research-agent.ts`)
**Role:** research
**Reports to:** Lead Engineer pipeline
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** research, investigation

### Description

Investigates the codebase across sub-topics (architecture, integration points, libraries, testing) before planning or triage, producing structured findings.

---

## Adding a New Authority Agent

1. Create the agent in `apps/server/src/services/authority-agents/<name>-agent.ts` (see the existing PM/ProjM/EM/Research agents and `agent-utils.ts`).
2. Wire it into the Lead Engineer pipeline / `AuthorityService` registration.
3. If it needs a new policy code, add it to `AgentRoleName` in `libs/types/src/policy.ts` and to `DEFAULT_PERMISSION_MATRIX` / `DEFAULT_STATUS_TRANSITIONS` in `apps/server/src/services/policy-engine.ts`.
4. Update this file and [org-chart.md](./org-chart.md) by hand — keep them in sync with the code.
5. See `docs/internal/agents/adding-team-members.md` for the full guide.
