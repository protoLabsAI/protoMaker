# Engine Architecture

> **Status**: APPROVED
> **Date**: 2026-02-18
> **Authors**: Josh, Ava
> **Supersedes**: crew-loops.md, adding-team-members.md (partially)

This document defines the Automaker engine architecture. It is the source of truth for how signals flow through the system, how agents are organized, and how work gets done.

---

## Org Structure

```
                         USER
                           |
                           v
                    +==============+
                    ||    AVA     ||
                    || World State||
                    ||  + Router  ||
                    +======+=======+
                           |
              +------------+------------+
              v                         v
     +----------------+       +----------------+
     |   OPERATIONS   |       |      GTM       |
     |                |       |   (parked)     |
     |  Lead Engineer |       |                |
     |  State Machine |       |  Jon | Cindi   |
     |                |       |  (manual for   |
     |  Frank | Sam   |       |   now)         |
     |  Matt  | Kai   |       +----------------+
     +----------------+
```

### AVA (Automated Virtual Agency)

AVA is the **nerve center**. She sees the full world state — server alerts, social media, Linear issues, Discord messages, GitHub events, everything. Her job:

- **Classify** every signal: is this Ops or GTM?
- **Route** to the right branch
- **Monitor** outcomes and escalations
- **Decide** priorities and resource allocation

AVA **never writes code**. She never fixes PRs, never posts content, never deploys. She routes and monitors. She is the only entity with full world state visibility.

### Operations Branch

The Ops branch owns all code — from feature creation to production deployment. It has two layers:

**Lead Engineer** — the state machine that processes features through the pipeline. It runs independently once triggered. AVA starts it; it handles the rest.

**Persona Agents** — the hands that write code. Each owns a domain:

| Agent     | Domain                                                          | Tools                           | Escalates To             |
| --------- | --------------------------------------------------------------- | ------------------------------- | ------------------------ |
| **Frank** | Infra, deploy, CI, Docker, monitoring, staging                  | Bash, Docker, scripts, config   | Sam (agent flow issues)  |
| **Sam**   | Agent flows, LangGraph, providers, observability, tracing       | Full codebase, flows, providers | Frank (infra needs)      |
| **Matt**  | UI, components, design system, frontend architecture, Storybook | UI files, components, styles    | Kai (needs API endpoint) |
| **Kai**   | Express routes, services, API design, backend logic, database   | Server code, services, routes   | Sam (needs flow change)  |

**Peer requests** create feature dependencies. If Matt needs an API endpoint, that spawns a Kai feature as a dependency. The Lead Engineer handles ordering.

### GTM Branch (Parked)

GTM handles go-to-market: market research, content creation, social media, competitive analysis, metrics. Agents: Jon (strategy) and Cindi (content).

**Status: PARKED.** GTM signals are logged but handled manually for now. The architecture supports it — AVA classifies GTM signals and can route them once the machines are built.

---

## Lead Engineer State Machine

The Lead Engineer replaces: auto-mode polling loop, PR Maintainer crew, Board Janitor crew, System Health crew, PR State Sync crew. One state machine, one flow.

### States

```
  feature
     |
     v
  INTAKE ---> PLAN ---> EXECUTE ---> REVIEW ---> MERGE ---> DONE
                |           |            |
           (complex    (retry w/    (CI fail:
             only)     context,     back to
                       bounded)     EXECUTE)
                           |
                           v
                       ESCALATE
                      (to AVA)
```

#### INTAKE

Feature lands on the board. The Lead Engineer:

1. Loads feature metadata (title, description, complexity, dependencies)
2. Validates all dependencies are satisfied (foundation deps require `done`, normal deps accept `review`)
3. Classifies complexity if not set
4. Assigns persona agent based on domain detection:
   - Files in `apps/ui/`, `libs/ui/`, component references -> **Matt**
   - Files in `apps/server/src/routes/`, `apps/server/src/services/` -> **Kai**
   - Files in `libs/flows/`, `libs/llm-providers/`, `libs/observability/` -> **Sam**
   - Files in `scripts/`, `docker-compose*`, `.github/`, Dockerfile -> **Frank**
   - Mixed or unclear -> **Kai** (default backend, most common)
5. Sets up worktree
6. Transitions to PLAN or EXECUTE based on complexity

#### PLAN (Complex Features Only)

For `large` or `architectural` complexity:

1. Agent researches the codebase — reads relevant files, understands patterns
2. Produces a plan with approach, files to modify, risks
3. **Antagonistic gate** (factor-based):
   - `large` complexity: light review — second perspective checks the plan against acceptance criteria
   - `architectural` complexity: full review — dual perspective challenges assumptions
4. Plan approved -> EXECUTE
5. Plan rejected -> revise or ESCALATE

Small and medium features skip directly to EXECUTE.

#### EXECUTE

The persona agent runs in an isolated worktree:

1. Agent receives: feature description, plan (if any), context files, memory, implementation instructions
2. Agent writes code using their domain tools
3. On completion: commit changes
4. Transition to REVIEW
5. On failure: retry with failure context (bounded — max 3 retries per complexity tier)
6. On max retries: ESCALATE

#### REVIEW

PR created and CI runs:

1. Push branch, create PR (via Graphite or gh CLI)
2. Enable auto-merge
3. Wait for CI checks (format, lint, test, build, audit)
4. Wait for CodeRabbit review
5. Resolve non-critical CodeRabbit threads
6. If CI fails: extract failure context, transition back to EXECUTE (max 2 CI retry cycles)
7. If all checks pass: transition to MERGE

This state absorbs what PR Maintainer used to do on a 10-minute cron.

#### MERGE

Auto-merge completes:

1. PR merges to main (or epic branch)
2. Board status updates to `done`
3. GH -> Linear sync closes corresponding tickets
4. Feature marked complete
5. Transition to DONE

This state absorbs what Board Janitor used to do on a 15-minute cron.

#### ESCALATE

Short-circuit triggers:

| Trigger                              | Action                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| Feature fails 3+ times               | Escalate model (haiku -> sonnet -> opus), then flag AVA |
| PR fails CI 3+ times                 | Flag AVA with failure context                           |
| Budget exceeded                      | Stop agent, flag AVA                                    |
| Circular dependency detected         | Flag AVA                                                |
| Agent needs expertise outside domain | Create dependency feature for the right persona         |
| Unknown/unrecoverable error          | Flag AVA for manual triage                              |

AVA receives escalations and decides: retry with different approach, assign to different persona, or park for human review.

#### DONE

Terminal state. Feature is complete. Learnings stored in `.automaker/memory/`.

### Concurrency

The auto-mode orchestration loop **remains** — it handles:

- Polling for ready features (dependency-resolved, unblocked)
- Heap memory guards (80% defer, 90% abort)
- Concurrent agent limits
- Circuit breaker (2 failures in 60s -> pause -> auto-resume after 5min)
- Feature selection priority ordering

The Lead Engineer state machine is called **per feature** by the orchestration loop. The loop is the scheduler; the state machine is the executor.

---

## Signal Routing

AVA classifies every incoming signal and routes to the right branch.

### Classification Table

| Signal Source                            | Classification  | Route                                 |
| ---------------------------------------- | --------------- | ------------------------------------- |
| Linear issue (engineering label/project) | Ops             | Lead Engineer -> board feature        |
| Linear issue (marketing label/project)   | GTM             | Log + park (manual)                   |
| GitHub issue (any)                       | Ops             | Lead Engineer -> board feature        |
| GitHub PR event                          | Ops             | Lead Engineer REVIEW state            |
| Discord #dev / #infra                    | Ops             | Lead Engineer -> board feature        |
| Discord #marketing / #social             | GTM             | Log + park (manual)                   |
| Server health alert                      | Ops             | Lead Engineer -> Frank feature        |
| Social media mention                     | GTM             | Log + park (manual)                   |
| MCP `create_feature`                     | Ops (fast path) | Direct to board, no PM pipeline       |
| MCP `process_idea`                       | Ops (full path) | PM Agent -> PRD -> decompose -> board |
| User CLI command                         | Direct          | Persona agent in interactive mode     |

### Fast Path vs Full Path

**Fast path**: Signal -> board feature -> Lead Engineer. For when you know exactly what you want built. `create_feature` MCP tool, direct board creation.

**Full path**: Signal -> AVA classification -> PM Agent (research + SPARC PRD) -> decompose to features -> Lead Engineer. For vague ideas or external signals that need refinement.

Both paths converge at the board. The Lead Engineer doesn't care how the feature got there.

---

## Antagonistic Distill-Up

Not every result needs debate. The gate level is factor-based:

| Factor                      | Gate                  | What Happens                                              |
| --------------------------- | --------------------- | --------------------------------------------------------- |
| `small` complexity, bug fix | **None**              | Agent executes, CI validates, merge                       |
| `medium` complexity         | **Light**             | Check diff against acceptance criteria before merge       |
| `large` complexity          | **Full plan review**  | Second agent perspective challenges plan before execution |
| `architectural` complexity  | **Dual review**       | Two viewpoints challenge plan + review result             |
| PRD / project planning      | **Antagonistic**      | Dual reviewer (Ava + Jon style) challenges assumptions    |
| Failure recovery            | **Escalation review** | Different agent reviews why it failed before retry        |

The gate is applied at the **PLAN** state (before execution) and optionally at the **REVIEW** state (before merge) for architectural changes.

### How It Works

1. **Top-down**: Signal flows down through AVA -> Branch -> Agent
2. **Bottom-up**: Result flows up through Agent -> Lead Engineer validation -> (optional antagonistic gate) -> merge
3. **Learnings**: Each escalation, failure, and success gets captured in `.automaker/memory/` for future agents

---

## Two Surfaces

The same persona agents serve both interactive and autonomous use cases.

### Interactive (CLI / Skills)

You type `/matt` and talk to Matt about frontend. You type `/frank` and ask about infra. These are the same agent templates — same system prompts, same domain knowledge, same personality. But they run in conversational mode:

- Connected to your terminal via WebSocket
- Context files + memory loaded
- You drive the conversation
- No board involvement

### Autonomous (Pipeline)

AVA routes a signal -> Lead Engineer picks it up -> assigns the right persona -> agent runs to completion. Same templates, different trigger:

- Runs in isolated worktree
- Board-driven lifecycle (INTAKE -> ... -> DONE)
- No human in the loop (until ESCALATE)
- Output streams to UI dashboard

The agent template system (`RoleRegistryService`, `AgentFactoryService`) serves both surfaces. A template defines: persona, model, tools, domain boundaries. The execution path determines whether it's interactive or autonomous.

---

## Kill List

Systems removed by this architecture:

| System                    | File(s)                                                    | Why                                     |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| PR Maintainer crew        | `crew-members/pr-maintainer-check.ts`                      | Absorbed by REVIEW state                |
| Board Janitor crew        | `crew-members/board-janitor-check.ts`                      | Absorbed by state transitions           |
| System Health crew        | `crew-members/system-health-check.ts`                      | Signals route through AVA to Frank      |
| PR State Sync crew        | `crew-members/pr-state-sync-check.ts`                      | GH -> Linear sync handles it            |
| GTM crew                  | `crew-members/gtm-check.ts`                                | GTM branch is parked                    |
| Ava crew check            | `crew-members/ava-check.ts`                                | AVA is the router, not a crew member    |
| CrewLoopService           | `services/crew-loop-service.ts`                            | Replaced by Lead Engineer state machine |
| Crew API routes           | `routes/crew/`                                             | No more crew system                     |
| AgentExecutionService     | `services/agent-execution-service.ts`                      | Unused consolidation target (551 lines) |
| auto-mode/ subdirectory   | `services/auto-mode/`                                      | Abandoned refactor, never integrated    |
| Legacy auto-mode methods  | `startAutoLoop()`, `runAutoLoop()`                         | Superseded by per-project methods       |
| Unused LangGraph flows    | Status Report, Risk Assessment, Milestone Summary, Wrap-Up | Wired but never called                  |
| generate_project_prd stub | `routes/projects/lifecycle/generate-prd.ts`                | Returns null, dead code                 |
| Content pipeline mocks    | Research/outline nodes in `libs/flows/src/content/`        | Mock data, not functional               |
| Storybook reference       | `scripts/setup-staging.sh` line 229                        | No compose service exists               |

**Estimated removal**: ~3000+ lines

---

## What Stays

| System                       | Why                                                                       |
| ---------------------------- | ------------------------------------------------------------------------- |
| Auto-mode orchestration loop | Handles concurrency, heap, feature selection. Delegates to Lead Engineer. |
| Feature dependency resolver  | Kahn's algorithm, foundation deps, priority ordering. Core scheduling.    |
| Git workflow service         | Post-completion pipeline (commit, push, PR, merge). Core plumbing.        |
| PR feedback service          | CI failure remediation, CodeRabbit resolution. Moves into REVIEW state.   |
| Agent templates + registry   | Persona definitions. Serves both surfaces.                                |
| DynamicAgentExecutor         | Runs persona agents. Gets context injection fix.                          |
| Signal intake service        | Core intake pipeline. Gets AVA classification layer.                      |
| Deploy pipeline              | Drain, build, verify, rollback. Gets hardening.                           |
| Antagonistic review flow     | Functional LangGraph flow. Used in PLAN state gate.                       |
| Project planning flow        | Functional LangGraph flow. Used in full-path intake.                      |
| Context file loader          | Loads .automaker/context/ and memory into agent prompts.                  |

---

## Implementation Order

1. **This document** (M1) — approved, gates everything
2. **Lead Engineer types** — define the state machine in TypeScript
3. **Lead Engineer core** — implement state transitions
4. **Auto-mode integration** — wire Lead Engineer into the orchestration loop
5. **Kill crew loops** — remove crew system after Lead Engineer handles their responsibilities
6. **Clean dead code** — remove everything on the kill list
7. **Signal routing** — AVA classification layer
8. **Deploy hardening** — fix concurrency, health checks
