# Agent philosophy

Why protoLabs uses named personas, domain-scoped delegation, model tiers, worktree isolation, and event-driven coordination. This document explains the _why_ behind the multi-agent system. For the _how_, see [Architecture Overview](./architecture.md).

## Why named personas

protoLabs agents are not generic "Agent 1, Agent 2" instances. Each has a domain specialization and personality — frontend, agent infrastructure, backend, devops, content, GTM, and orchestration.

### Domain boundaries

Named personas enforce strict domain boundaries. The frontend agent only touches `apps/ui/` and component code. The backend agent owns `apps/server/src/routes/` and services. The DevOps agent handles Docker, CI, and deploy scripts. This isn't cosmetic — it prevents the single biggest failure mode of multi-agent systems: agents stepping on each other's work.

When a feature spans domains (frontend + backend), it doesn't get assigned to one agent. Instead, the Lead Engineer creates two features with a dependency edge. The backend feature ships first; the frontend feature depends on it. Each agent works in its domain, in its own worktree, with no merge conflicts.

### Memory accumulation

Named personas accumulate domain-specific memory. When the frontend agent discovers that Tailwind v4 requires `@import "tailwindcss"` instead of `@tailwind base`, that learning persists in `.automaker/memory/` and feeds into future frontend executions. Generic agents would lose this context or pollute other domains with irrelevant learnings.

### Audit trail accountability

When a PR introduces a regression, the audit trail shows exactly which persona made which decision. "The infrastructure agent modified `libs/flows/src/coordinator.ts` at turn 14, after reading `libs/flows/src/content/section-writer.ts`" is actionable. "Agent 3 modified file X" is not.

### The roster

The canonical roster lives in `libs/prompts/src/shared/team-base.ts` as the `TEAM_ROSTER` constant. Every agent receives this table in its system prompt, so each agent knows _who to delegate to_ when work falls outside its domain.

| Agent                    | Domain        | Delegate when...                                       |
| ------------------------ | ------------- | ------------------------------------------------------ |
| **Orchestrator**         | Orchestration | Product direction, cross-team coordination, escalation |
| **Frontend agent**       | Frontend      | React, UI components, design system, Tailwind, a11y    |
| **Infrastructure agent** | Agent infra   | LangGraph flows, LLM providers, observability          |
| **Backend agent**        | Backend       | Express routes, services, API design, error handling   |
| **DevOps agent**         | DevOps        | CI/CD, Docker, deploy, monitoring, infra               |
| **GTM agent**            | GTM           | Content strategy, brand, social media, launches        |
| **Content agent**        | Content       | Blog posts, docs, training data, SEO copy              |
| **PR Maintainer**        | Pipeline      | Auto-merge, CodeRabbit threads, format fixes           |
| **Board Janitor**        | Board hygiene | Stale features, dependency repair, status cleanup      |

## Two surfaces: interactive and autonomous

The same agent templates serve both interactive and autonomous use cases. This is a deliberate architectural choice — not accidental reuse.

### Interactive (CLI / Discord)

When you invoke a domain agent in Claude Code, you get it in conversational mode:

- Connected to your terminal via WebSocket
- Context files and memory loaded from `.automaker/context/` and `.automaker/memory/`
- You drive the conversation
- No board involvement, no state machine

### Autonomous (pipeline)

When auto-mode picks up a frontend feature, it gets the same frontend agent template:

- Runs in an isolated worktree
- Board-driven lifecycle (INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE)
- No human in the loop until ESCALATE
- Output streams to the UI dashboard

### Why this matters

Agent roles are defined with persona identity, model tier, tool access, and domain boundaries. The _execution path_ determines interactive vs autonomous — not the role definition. This means:

1. **Consistent behavior** — A domain agent gives the same quality advice whether you're chatting or auto-mode is running
2. **Single source of truth** — prompt improvements benefit both surfaces immediately
3. **No divergence** — there's no "interactive" and "pipeline" version of the same agent drifting apart over time

## Delegation decision tree

When a feature enters the Lead Engineer's INTAKE state, it must be assigned to the right persona. The assignment uses file-path pattern matching:

```
Files in apps/ui/, libs/ui/, component references      → Frontend agent
Files in apps/server/src/routes/, services/             → Backend agent
Files in libs/flows/, libs/observability/ → Infrastructure agent
Files in scripts/, docker-compose*, .github/, Dockerfile → DevOps agent
Mixed or unclear                                        → Backend agent (default)
```

### Cross-domain features

When a feature touches multiple domains, the Lead Engineer doesn't assign it to one agent. Instead:

1. The feature is split into domain-scoped sub-features
2. Dependencies are set (e.g., backend before frontend)
3. Each sub-feature is assigned to the appropriate persona
4. The dependency resolver ensures correct ordering

This mirrors how human engineering teams work: the backend engineer builds the API, the frontend engineer consumes it. Peer requests create feature dependencies, and the Lead Engineer handles ordering.

### Fallback

When domain detection is ambiguous, the backend agent is the default. Backend is the most common domain in this monorepo, and the backend agent's prompt includes enough general engineering knowledge to handle edge cases.

## Model tier philosophy

Not all work requires the same level of reasoning. protoLabs uses a tiered model selection:

| Model      | Cost         | Use case                                                             | Triggered by                                                                 |
| ---------- | ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Haiku**  | ~$0.001/turn | Mechanical tasks — format fixes, PR thread resolution, board cleanup | `complexity: 'small'` or Haiku-tier templates (PR Maintainer, Board Janitor) |
| **Sonnet** | ~$0.01/turn  | Standard implementation — routes, services, components, tests        | `complexity: 'medium'` or `'large'` (default)                                |
| **Opus**   | ~$0.10/turn  | Architectural decisions, orchestration, complex debugging            | `complexity: 'architectural'` or auto-escalation after 2+ failures           |

### Auto-escalation

The model tier isn't fixed for a feature's lifetime. When a feature fails twice at the Sonnet tier, it automatically escalates to Opus on retry. This captures the human pattern of "this is harder than I thought, let me think more carefully."

The escalation chain: Haiku → Sonnet → Opus → ESCALATE (human intervention).

### Cost discipline

Model selection is about cost discipline, not capability gatekeeping. Using Opus for a format fix wastes ~100x the cost. Using Haiku for an architectural refactor wastes developer time in failed retries. The tier system matches cost to complexity.

Use `resolveModelString()` from `@protolabsai/model-resolver` to convert aliases to model IDs.

## Worktree isolation as a first principle

Every feature executes in an isolated [git worktree](https://git-scm.com/docs/git-worktree). This isn't a convenience — it's a foundational design constraint.

### Why isolation matters

1. **Parallel execution** — Multiple agents work on different features simultaneously. Without worktrees, they'd be editing the same files in the same directory, creating merge conflicts and race conditions.

2. **Safe rollback** — If an agent's changes break the build, the worktree can be discarded without affecting main or other features. No `git reset --hard` on shared state.

3. **Clean diffs** — Each worktree starts from a known base (usually `origin/main`). The diff for each PR shows _only_ the changes for that feature, making review tractable.

4. **Resource management** — Worktrees are auto-created when an agent starts (`{projectPath}/.worktrees/{branch-name}`) and can be cleaned up after merge. The filesystem is the isolation boundary.

### The ENOENT risk

Worktrees introduce a critical safety constraint: **never `cd` into a worktree**. If the worktree is deleted while a process has its working directory inside it, every subsequent `posix_spawn` call fails with `ENOENT`. This kills the Bash tool for the rest of the session.

All agents receive the `WORKTREE_SAFETY` prompt fragment (from `team-base.ts`):

> NEVER `cd` into `.worktrees/`. Use `git -C <worktree-path>` or absolute paths instead. Worktrees are managed by the system — don't create or delete them manually.

The `guard-bash.sh` PreToolUse hook blocks `cd` commands that target `.worktrees/` as an additional safety net.

## Event-driven coordination

Authority agents (PM, ProjM, EM) and the Lead Engineer coordinate via a shared event bus — not direct method calls.

### Why events, not direct calls

1. **Loose coupling** — The PM Agent doesn't import `LeadEngineerService`. It emits `authority:pm-prd-ready` and trusts the pipeline to route it.

2. **Extensibility** — Adding a new listener (say, a Slack notifier) requires zero changes to existing agents.

3. **Audit trail** — Every event is observable via WebSocket, Langfuse traces, and the escalation log.

4. **Resilience** — If the PM Agent crashes, the event bus doesn't crash. The next agent in the chain simply doesn't receive the trigger — which surfaces as a "stale gate" in the health sweep.

### Key event chains

```
authority:idea-injected → PM research → authority:pm-prd-ready
    → SPEC_REVIEW gate → authority:pm-review-approved
    → ProjM decomposes → milestone:started
    → Lead Engineer picks up → per-feature state machine
    → feature:pr-merged → (reflection, memory update)
```

See [Idea to Production Pipeline](../dev/idea-to-production.md) for the full 8-phase event chain.

## Self-improvement loop

Agents don't just execute — they learn. The system has three feedback mechanisms:

### Per-feature reflections

After each feature reaches DONE, a lightweight reflection is generated:

1. A Haiku call reads the tail of `agent-output.md` plus execution metadata (cost, retries, remediation cycles)
2. Produces a structured reflection under 200 words
3. Writes to `.automaker/features/{id}/reflection.md`

When the next feature enters EXECUTE, the Lead Engineer loads reflections from up to 3 recently completed sibling features (same epic or project). These are injected into the agent's context as "Learnings from Prior Features."

Cost: ~$0.001 per reflection. Fire-and-forget — failure does not block the state machine.

### Memory files

Agents accumulate learnings in `.automaker/memory/`. The context loader scores memory files against the current task (keyword matching against frontmatter tags) and injects the top N most relevant files into the agent prompt.

### Continuous improvement tracking

Every persona agent receives the `CONTINUOUS_IMPROVEMENT` prompt fragment. When an agent encounters a bug, code smell, or missing test during execution, it creates a board feature (search-before-create to avoid duplicates). This turns every agent execution into a low-cost audit of the codebase.

## Design principles summary

| Principle           | Implementation                                  |
| ------------------- | ----------------------------------------------- |
| Domain boundaries   | Named personas with file-path routing           |
| Consistent behavior | Same templates for interactive + autonomous     |
| Cost discipline     | Haiku/Sonnet/Opus tier with auto-escalation     |
| Safe parallelism    | Worktree isolation per feature                  |
| Loose coupling      | Event bus, not direct method calls              |
| Continuous learning | Reflections, memory files, improvement tracking |

## Related documentation

- [Architecture Overview](./architecture.md) — Technical implementation details
- [Reliability & Recovery](./reliability.md) — Failure handling, escalation, health sweeps
- [Prompt Engineering](./prompt-engineering.md) — How prompts are composed and customized
- [Engine Architecture](../archived/engine-architecture.md) — ADR for the Lead Engineer design
- [Idea to Production](../dev/idea-to-production.md) — Full 8-phase pipeline reference
