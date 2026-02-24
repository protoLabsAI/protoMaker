# protoLabs Agency System — Overview

## What It Is

protoLabs is a fully autonomous software development agency powered by AI agents. It takes ideas from any source — human conversation, Discord messages, Linear issues, GitHub — and transforms them into shipped, tested, merged code through a repeatable, measurable loop.

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

### Operations

Signal triage, quality gates, team health, and external communication. Orchestration agents use domain tools and subagents to manage tasks, distill information, and maintain context.

| Agent               | Type         | Responsibilities                                                       |
| ------------------- | ------------ | ---------------------------------------------------------------------- |
| **Project Owner**   | Human (CEO)  | Ideas, direction, final approval                                       |
| **Ava** (CoS)       | AI Orchestr. | Signal triage, antagonistic review, ceremonies, Discord comms          |
| **Jon** (GTM)       | AI Agent     | Market perspective, content strategy, positioning, antagonistic review |
| **Cindi** (Content) | AI Agent     | Blog posts, technical docs, SEO, content pipeline                      |

### Engineering

Production orchestration, auto-mode execution, and code quality. The Lead Engineer uses fast-path rules (pure functions, no LLM) for routine decisions and escalates to full agent execution only when needed.

| Agent                  | Type        | Responsibilities                                                        |
| ---------------------- | ----------- | ----------------------------------------------------------------------- |
| **Lead Engineer**      | Service     | Production orchestrator — fast-path rules, auto-mode management, events |
| **Matt** (Frontend)    | AI Agent    | React 19, design systems, Storybook, component architecture             |
| **Sam** (AI Agent Eng) | AI Agent    | LangGraph flows, LLM providers, observability, multi-agent coordination |
| **Frank** (DevOps)     | AI Agent    | Infrastructure health, deploys, monitoring, system reliability          |
| **Kai** (Backend)      | AI Agent    | Server-side features, API design, database, services                    |
| **Auto-mode Agents**   | Sonnet/Opus | Feature implementation in isolated git worktrees                        |

## Three Surfaces, Clear Separation

protoLabs operates across three systems that each own a distinct layer:

### Linear — Strategic Layer (Source of Truth)

- Vision, goals, initiatives, projects, roadmap
- Human reviews happen here
- Clients see progress here
- The "exec team" view

### protoLabs Board — Tactical Layer

- Features, agents, branches, PRs, task execution
- Where code actually gets written
- Agent worktrees, auto-mode, dependency chains
- The "dev team" view

### Discord — Communication Layer

- Async team coordination
- Status updates, alerts, ceremonies
- Josh ↔ Ava primary channel
- The "office" view

**Rule: Never mix the layers.** Linear doesn't track individual PRs. protoLabs doesn't own roadmap vision. Discord doesn't store state.

## The Flow

### 1. Idea Intake

Ideas arrive from anywhere:

- Josh types in Discord or creates a Linear issue
- Ava identifies operational improvements during execution
- Jon identifies market opportunities from content/social
- External stakeholders file GitHub issues
- Agents surface improvement opportunities from retros

All signals funnel through communication channels into the planning pipeline.

### 2. PRD Consolidation + Antagonistic Review

Every idea gets a SPARC PRD (Situation, Problem, Approach, Results, Constraints). Two agents review it from opposing perspectives:

- **Ava (CoS)**: Is this operationally feasible? Does it align with current capacity? What's the risk?
- **Jon (GTM)**: Does this create customer value? Can we sell this? Does it strengthen our positioning?

They challenge each other in a 3-stage sequential review. The output is a consolidated plan that has survived cross-functional scrutiny.

### 3. Approval Gate

Josh reviews the PRD in Linear. Two modes:

- **Standard**: Josh reviews, comments, approves or requests changes
- **preApproved**: Low-risk items (small scope, operational improvements) auto-pass based on trust boundaries

### 4. Planning & Research

ProjM takes the approved PRD and does deep research:

- Analyzes the codebase for relevant patterns
- Identifies files that need modification
- Designs milestones and phases
- Sets acceptance criteria
- Estimates complexity

Output: Milestones with ordered phases, posted to Linear for visibility.

### 5. Launch + Lead Engineer

`launch_project` sets Linear status to "started" and kicks off auto-mode. The Lead Engineer auto-starts on the `project:lifecycle:launched` event and takes over production orchestration:

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
- **Not a black box** — it's observable. Linear for strategy, protoLabs board for tactics, Discord for communication. Langfuse for traces and costs. Full audit trail.
- **Not static** — it's self-improving. The system upgrades itself through the same pipeline it uses for customer work.
- **Not LLM-dependent** — fast-path rules handle routine orchestration decisions without API calls. LLM agents are reserved for creative work.
