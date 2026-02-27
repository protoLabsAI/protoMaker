# Engine Architecture

> **Status**: APPROVED
> **Date**: 2026-02-18
> **Authors**: Josh, Ava
> **Supersedes**: internal/adding-team-members.md (partially)

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

**Note:** Sam and Kai both register as `backend-engineer` in the role registry today. Domain detection uses file-path pattern matching (see INTAKE), not the template role field. M2 should formalize this — each persona gets a unique role identifier.

**Peer requests** create feature dependencies. If Matt needs an API endpoint, that spawns a Kai feature as a dependency. The Lead Engineer handles ordering.

### GTM Branch (Gated)

GTM handles go-to-market: market research, content creation, social media, competitive analysis, metrics. Agents: Jon (strategy) and Cindi (content).

**Controlled by `gtmEnabled` setting** (default: `false`). When disabled, the `SignalIntakeService` forces all signals to ops classification, content API routes return 403, and the flow graph hides GTM nodes. Enable via global settings to activate the full GTM pipeline.

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
   - Files in `libs/flows/`, `libs/observability/` -> **Sam**
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

Terminal state. Feature is complete. A per-feature reflection is generated (see [Per-Feature Reflection Loop](#per-feature-reflection-loop) below).

### Concurrency

The auto-mode orchestration loop **remains** — it handles:

- Polling for ready features (dependency-resolved, unblocked)
- Heap memory guards (80% defer, 90% abort)
- Concurrent agent limits
- Circuit breaker (2 failures in 60s -> pause -> auto-resume after 5min)
- Feature selection priority ordering

The Lead Engineer state machine is called **per feature** by the orchestration loop. The loop is the scheduler; the state machine is the executor.

#### Health Sweep

Every ~100 seconds (50 iterations at 2s interval), the auto-mode loop runs `FeatureHealthService.audit()` with auto-fix enabled. This catches:

- **Stale running** — features marked `in_progress` with no active agent. Reset to `backlog`.
- **Stale gates** — features awaiting a pipeline gate (e.g., SPEC_REVIEW) for >1 hour. Moved to `blocked`.
- **Orphaned epic refs**, **dangling dependencies**, **merged-but-not-done** — structural drift on the board.

Each detected issue emits an `escalation:signal-received` event with a deduplication key, so the escalation router and notification system can alert the user without flooding.

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

| System                    | File(s)                                                    | Lines | Why                                       |
| ------------------------- | ---------------------------------------------------------- | ----- | ----------------------------------------- |
| PR Maintainer crew        | `crew-members/pr-maintainer-check.ts`                      | ~250  | Absorbed by REVIEW state                  |
| Board Janitor crew        | `crew-members/board-janitor-check.ts`                      | ~200  | Absorbed by state transitions             |
| PR State Sync crew        | `crew-members/pr-state-sync-check.ts`                      | ~150  | GH -> Linear sync handles it              |
| GTM crew                  | `crew-members/gtm-check.ts`                                | ~100  | GTM branch is parked                      |
| Ava crew check            | `crew-members/ava-check.ts`                                | ~300  | AVA is the router, not a crew member      |
| Frank crew check          | `crew-members/frank-check.ts`                              | ~200  | Host health routes through AVA to Frank   |
| Crew barrel + test        | `crew-members/index.ts`, `crew-loop.test.ts`               | ~300  | Entire crew system removed                |
| CrewLoopService           | `services/crew-loop-service.ts`                            | ~800  | Replaced by Lead Engineer state machine   |
| Crew API routes           | `routes/crew/`                                             | ~200  | No more crew system                       |
| AgentExecutionService     | `services/agent-execution-service.ts`                      | ~550  | Unused consolidation target, never called |
| auto-mode/ subdirectory   | `services/auto-mode/`                                      | ~600  | Abandoned refactor, never integrated      |
| Legacy auto-mode methods  | `startAutoLoop()`, `runAutoLoop()`                         | ~200  | Superseded by per-project methods         |
| Unused LangGraph flows    | Status Report, Risk Assessment, Milestone Summary, Wrap-Up | ~500  | Wired but never called                    |
| LangGraph flow tests      | `libs/flows/tests/` (status, risk, milestone, wrap-up)     | ~500  | Tests for unused flows                    |
| generate_project_prd stub | `routes/projects/lifecycle/generate-prd.ts`                | ~50   | Returns null, dead code                   |
| generate_project_prd MCP  | `packages/mcp-server/src/index.ts` handler                 | ~30   | Calls the dead stub above                 |
| GitHubStateChecker        | `services/github-state-checker.ts`                         | ~440  | Abandoned, PR pipeline handles this       |
| ReconciliationService     | `services/reconciliation-service.ts`                       | ~390  | Never called, orphaned from refactor      |
| CrewLoop types            | `libs/types/src/crew.ts` (if standalone)                   | ~100  | Types for removed system                  |
| UI crew components        | `apps/ui/src/components/views/crew/`                       | ~300  | Frontend for removed crew system          |
| Storybook reference       | `scripts/setup-staging.sh` line 229                        | ~5    | No compose service exists                 |

**Cautions** (verify before removing):

- **System Health crew** (`system-health-check.ts`): Currently the only host-level health monitor. Must migrate RAM/disk/CPU checks into a Frank-triggered probe or Lead Engineer pre-flight before removing.
- **Legacy auto-mode methods** (`startAutoLoop`, `runAutoLoop`): Confirm all callers have been migrated to `startAutoModeForProject`/`runAutoModeForProject` before deleting.
- **Content pipeline** (`libs/flows/src/content/`): NOT dead code — the pipeline has real LLM-calling nodes (section-writer, antagonistic-reviewer). Only the research/outline stubs are mocked. Do NOT remove the full directory.

**Estimated removal**: ~5,500+ confirmed lines, ~9,500+ including UI components and types cleanup

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
| Content pipeline (partial)   | Section-writer + antagonistic-reviewer are functional LLM nodes. Keep.    |
| Context file loader          | Loads .automaker/context/ and memory into agent prompts.                  |

---

## Per-Feature Reflection Loop

After each feature reaches DONE, the DeployProcessor generates a lightweight reflection. This creates a learning loop within a single project — each feature benefits from the last.

### How It Works

1. **Generate** — `DeployProcessor.generateReflection()` fires non-blocking after marking a feature done
2. Reads the tail of `agent-output.md` (last 2000 chars) plus execution metadata (cost, retries, remediation cycles, review feedback, execution history)
3. Calls `simpleQuery()` with **haiku** (maxTurns: 1, no tools) to produce a structured reflection under 200 words
4. Writes result to `.automaker/features/{id}/reflection.md`
5. Emits `feature:reflection:complete` event

### Feed-Forward

When the next feature enters EXECUTE, `ExecuteProcessor.process()` loads reflections from completed sibling features:

- **Sibling matching**: same epicId (if in an epic) or same projectSlug (if standalone)
- **Recency cap**: top 3 most recently completed siblings
- **Injection point**: reflections are added to the `contextParts` array as "Learnings from Prior Features" and passed to the agent via `recoveryContext`

### Storage

Reflections are stored as files (not feature fields):

```
.automaker/features/{id}/reflection.md
```

Each reflection includes: title, timestamp, cost, retry/remediation counts, and the LLM-generated analysis.

### Cost

~$0.001 per reflection (haiku, single turn, no tools). Fire-and-forget — failure does not block the state machine.

### Observability

Reflection LLM calls are traced in Langfuse with:

- Tag: `feature:{id}`, `role:reflection`
- Metadata: `featureId`, `featureName`, `agentRole: 'reflection'`

See [Langfuse Integration — Reflection Tracing](./langfuse-integration.md#reflection-tracing) for details.

---

## Agent Self-Improvement Loop

Agents don't just execute — they learn. Every agent has a feedback channel back into the system.

### Per-Agent Improvement Tool

Every persona agent receives a `file_improvement_request` tool. During execution, if the agent notices:

- A missing context file that would have helped
- A prompt instruction that was misleading or incomplete
- A tool that should exist but doesn't
- A pattern that should be documented

...it files an improvement request. These go to a queue, not directly to code.

### Periodic Reflection

A reflection agent runs on schedule (post-batch completion + daily):

1. **Reads Langfuse traces** — cost spikes, failure patterns, slow nodes
2. **Reads improvement request queue** — deduplicates, clusters by theme
3. **Reads `.automaker/memory/`** — checks for stale or contradictory learnings
4. **Produces recommendations** — ranked by impact, with specific file paths

### Context and Prompt Evolution

Recommendations flow through an antagonistic gate before touching prompts or context:

1. Reflection agent proposes a change (e.g., "add import convention to CLAUDE.md")
2. Antagonistic review challenges: "Does this conflict with existing instructions? Is it premature?"
3. If approved: change applied automatically (context files) or queued for human review (system prompts)
4. If rejected: logged with reason for future pattern matching

### Host Health Migration

System Health crew's RAM/disk/CPU checks migrate into this loop as a **pre-flight probe**. Before any agent starts, the Lead Engineer checks host capacity. This replaces the standalone cron with an integrated check.

---

## Analytics Flow Alignment

The analytics dashboard (`/analytics`) visualizes agent flow execution as node graphs. As the engine architecture evolves, the analytics flows must reflect the actual system:

- **Lead Engineer state machine** nodes (INTAKE, PLAN, EXECUTE, REVIEW, MERGE, DONE, ESCALATE) should appear as trackable flow nodes with timing and cost data
- **Signal routing** classification decisions should be traced as flow entry points
- **Antagonistic gates** should show as decision nodes with approve/reject branches
- **Self-improvement loop** reflection runs should appear as periodic flow executions

The existing LangGraph flow visualization infrastructure supports this — the analytics page already renders node graphs from Langfuse traces. M2+ implementations should emit trace events that the analytics dashboard can consume without UI changes.

---

## Implementation Order

1. **This document** (M1) — approved, gates everything
2. **Lead Engineer types** — define the state machine in TypeScript
3. **Lead Engineer core** — implement state transitions
4. **Auto-mode integration** — wire Lead Engineer into the orchestration loop
5. **Kill crew loops** — remove crew system after Lead Engineer handles their responsibilities
6. **Clean dead code** — remove everything on the kill list
7. **Signal routing** — AVA classification layer
8. **Self-improvement loop** — `file_improvement_request` tool, reflection agent, context evolution
9. **Analytics alignment** — ensure new flows emit traces consumable by `/analytics` dashboard
10. **Deploy hardening** — fix concurrency, health checks
