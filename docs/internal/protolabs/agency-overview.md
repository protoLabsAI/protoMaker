# protoLabs Agency System — Overview

## What It Is

protoLabs is a fully autonomous software development agency powered by AI agents. It takes ideas from any source — human conversation, Discord messages, GitHub issues — and transforms them into shipped, tested, merged code through a repeatable, measurable loop.

The system doesn't just execute. It plans, challenges its own plans, breaks work into measurable pieces, delegates to specialized agents, monitors quality, and — critically — reflects on what it learned and feeds that back into better future work.

**The loop: IDEA → RESEARCH → EXPAND → EXECUTE → REFLECT → REPEAT**

## Why It Matters

### The Problem With AI-Assisted Development Today

Most AI coding tools operate at the wrong altitude. They help you write a function or fix a bug. protoLabs operates at the **organizational** level — it's not a tool, it's a **team**.

The gap between "AI can write code" and "AI can run a development organization" is:

- **Planning**: Who decides what to build and why?
- **Quality gates**: Who challenges bad ideas before they waste execution cycles?
- **Coordination**: How do parallel workstreams avoid conflicts?
- **Accountability**: How do you know if the work was worth doing?
- **Learning**: How does the org get smarter over time?

### The protoLabs Answer

protoLabs is organized into two branches — **Operations** and **Engineering** — with clear boundaries, quality guardrails, and domain tools that enable orchestration at scale.

### Operations (GTM Team)

Market positioning, content strategy, and external communication. Agents on this team evaluate ideas through a customer/business lens and produce outward-facing content.

| Agent               | Type         | Responsibilities                                                       |
| ------------------- | ------------ | ---------------------------------------------------------------------- |
| **Project Owner**   | Human (CEO)  | Ideas, direction, final approval                                       |
| **Ava** (CoS)       | AI Orchestr. | Signal triage, planning pipeline, antagonistic review, ceremonies      |
| **Jon** (GTM)       | AI Agent     | Market perspective, content strategy, positioning, antagonistic review |
| **Cindi** (Content) | AI Agent     | Blog posts, technical docs, SEO, content pipeline                      |

### Engineering (Dev Team)

Production orchestration, auto-mode execution, QA, infrastructure, and code quality. The Lead Engineer uses fast-path rules (pure functions, no LLM) for routine decisions and escalates to full agent execution only when needed.

| Agent                | Type         | A2A Endpoint | Responsibilities                                                        |
| -------------------- | ------------ | ------------ | ----------------------------------------------------------------------- |
| **Ava** (CoS)        | AI Orchestr. | `:3008`      | Planning, board health, auto-mode, feature management                   |
| **Quinn** (QA)       | AI Agent     | `:7870`      | Bug triage, PR review, QA reports, board audits                         |
| **Frank** (DevOps)   | AI Agent     | `:7880`      | Infrastructure, deploys, monitoring, system reliability                 |
| **Lead Engineer**    | Service      | internal     | Production orchestrator — fast-path rules, auto-mode management, events |
| **Auto-mode Agents** | Sonnet/Opus  | —            | Feature implementation in isolated git worktrees                        |

### Knowledge

| Agent          | Type     | Responsibilities                                               |
| -------------- | -------- | -------------------------------------------------------------- |
| **Researcher** | AI Agent | Deep research, entity extraction, knowledge graph construction |

## Three Surfaces, Clear Separation

protoLabs operates across three systems that each own a distinct layer:

### protoLabs Board — Tactical Layer (Source of Truth)

- Features, agents, branches, PRs, task execution, project tracking
- Where code actually gets written
- Agent worktrees, auto-mode, dependency chains
- The "dev team" view

### Workstacean — Routing + Registry Layer (Spine)

- `workspace/agents.yaml` — authoritative agent registry
- `workspace/projects.yaml` — authoritative project registry
- `GET /api/agents`, `GET /api/projects` — consumed by Quinn, protoMaker, and any future service
- `POST /publish` — external services inject messages onto the bus
- correlationId is minted here and carried through every downstream artifact

### Interface Plugins — Communication Layer

Any number of interface plugins can connect to the bus. Each plugin owns its native rendering (embeds, voice prompts, buttons, etc.) and implements three responsibilities: publish with `source`/`reply` metadata, render HITLRequest natively, and send HITLResponse back.

| Plugin  | Status  | Notes                                        |
| ------- | ------- | -------------------------------------------- |
| Discord | Active  | Primary — embeds, threads, webhooks          |
| Voice   | Planned | Voice-in/voice-out via Whisper + Kokoro      |
| GitHub  | Active  | Webhooks, issue/PR comments via bot accounts |
| Plane   | Planned | Board-native interface                       |
| Slack   | Planned | Workspace integration                        |
| API     | Active  | `POST /publish` for programmatic injection   |

**Rule: Never mix the layers.** The board owns all project state. Interface plugins don't store state. Workstacean owns routing and registry.

## The Flow

### 1. Idea Intake (via Interface Plugins)

Ideas arrive from any connected interface plugin:

- **Discord** — Josh types a message, Ava or Quinn mentioned
- **Voice** — spoken idea transcribed via Whisper, injected to bus
- **GitHub** — issue opened, PR comment, webhook event
- **Plane** — board feature created
- **Slack** — workspace message (planned)
- **API** — `POST /publish` for programmatic injection (scripts, cron, other services)
- **Agent signals** — Ava identifies operational improvements, Jon spots market opportunities, retros surface improvement tickets

Every signal enters the Workstacean bus with `source` metadata (which interface, which channel, which user) and a `reply` field (topic and format for sending responses back). Workstacean mints a `correlationId` at intake that follows the signal through its entire lifecycle.

### 2. PRD Consolidation + Antagonistic Review

Workstacean routes ideas to Ava's `plan` skill. Every idea gets a SPARC PRD (Situation, Problem, Approach, Results, Constraints). Two agents review it from opposing perspectives:

- **Ava (operational feasibility)**: Is this technically feasible? Does it align with current capacity? What's the risk?
- **Jon (strategic value)**: Does this create customer value? Can we sell this? Does it strengthen our positioning?

They challenge each other in a 3-stage sequential review. The output is a consolidated plan that has survived cross-functional scrutiny. This antagonistic relationship is a core org principle — it's how the system avoids confirmation bias.

### 3. Approval Gate (HITL via Bus)

Two paths based on antagonistic review scores:

- **Auto-approved**: Both Ava (operational) and Jon (strategic) score > 4.0 — project and features are created immediately. No human in the loop.
- **HITL path**: Ava publishes an `HITLRequest` to the `reply.topic` from the original signal. The message flows back through the bus to the originating interface plugin, which renders it natively (Discord embed with approve/reject buttons, voice prompt, Slack interactive message, etc.). The A2A call returns immediately with `{ status: "pending_approval", correlationId }`. When the human responds, an `HITLResponse` is published on the bus, routed back to Ava's `plan_resume` skill, which restores state from a SQLite checkpoint (`plans.db`, 7-day TTL) and creates the project + features.

### 4. Planning & Research

ProjM takes the approved PRD and does deep research:

- Analyzes the codebase for relevant patterns
- Identifies files that need modification
- Designs milestones and phases
- Sets acceptance criteria
- Estimates complexity

Output: Milestones with ordered phases, visible on the board.

### 5. Launch + Lead Engineer

`launch_project` sets the project to "started" and kicks off auto-mode. The Lead Engineer auto-starts on the `project:lifecycle:launched` event and takes over production orchestration:

- Maintains comprehensive world state (board counts, features, agents, PRs, milestones)
- Evaluates fast-path rules on every event — no LLM calls for routine decisions
- Handles: mergedNotDone, orphanedInProgress, staleDeps, autoModeHealth, staleReview, stuckAgent, capacityRestart, projectCompleting
- Refreshes state every 5 minutes and on significant events

### 6. Execution

Auto-mode processes features in dependency order:

- Creates isolated git worktrees
- Routes to appropriate agent model (Haiku for small, Sonnet for medium, Opus for architectural)
- Agent implements, tests, verifies
- On failure: iterate with more context, escalate model, or flag for human help

### 7. PR Pipeline

Automated quality assurance:

- Rebase on latest main
- Format fixes (Prettier)
- Push + create PR
- CI checks (build, test, format, audit)
- CodeRabbit AI review
- Thread resolution
- Auto-merge (squash to main)

### 8. Reflection

When an epic completes:

- **Retro**: What worked, what didn't, what to change
- **Metrics**: Cost, duration, failure rate, agent model distribution
- **Knowledge capture**: Update memory files with lessons learned
- **Improvement tickets**: Auto-create tasks from identified friction points
- **Changelog**: Generate human-readable summary of what shipped

The reflection loop is what makes this a **learning system**, not just an execution engine. Every project makes the next project better.

## CorrelationId Lineage

Every signal that enters the system gets a `correlationId` minted by Workstacean at intake. This ID is the spine that connects every artifact produced from that signal:

| Artifact        | Where correlationId lives                                  |
| --------------- | ---------------------------------------------------------- |
| Bus message     | `message.correlationId` — minted at intake                 |
| SPARC PRD       | `prd.metadata.correlationId`                               |
| Board project   | `project.metadata.correlationId`                           |
| Board features  | `feature.metadata.correlationId`                           |
| Pull requests   | PR body watermark                                          |
| Langfuse traces | `trace.metadata.correlationId`                             |
| HITL round-trip | `HITLRequest.correlationId` / `HITLResponse.correlationId` |

This enables end-to-end traceability: given any PR, you can trace back to the original idea, through the PRD, through the approval decision, to every feature that was created and every agent turn that executed.

## The Revenue Model

Open source first. Build the community, prove the tool, let revenue follow naturally.

protoLabs is the maintained successor to the original Automaker project. The original maintainers moved on — we picked it up, rebuilt it, and ship real products with it.

1. **Open source tool**: protoLabs is fully open source. Community adoption is the growth engine.
2. **Portfolio proof**: We use protoLabs to build our own products (MythXEngine, SVGVal, rabbit-hole). The tool proves itself through what it ships.
3. **Consulting (setupLab)**: Help organizations set up their own autonomous dev pipeline. Organic inbound from community trust, not outbound sales.

No paid tiers, no subscriptions, no paywalls. Everything is open. Trust compounds faster than revenue.

## What Makes This Different

- **Not a copilot** — it's a team. Operations + Engineering branches with specialized agents, domain tools, and subagent delegation.
- **Not one-shot** — it's a loop. Continuous improvement feeds learning back into planning.
- **Not just code** — it's organizational. Antagonistic review, HITL gates, CI pipeline, and code quality checks form four layers of quality assurance.
- **Not a black box** — it's observable. protoLabs board for project tracking, Discord for communication. Langfuse for traces and costs. Full audit trail.
- **Not static** — it's self-improving. The system upgrades itself through the same pipeline it uses for customer work.
- **Not LLM-dependent** — fast-path rules handle routine orchestration decisions without API calls. LLM agents are reserved for creative work.
