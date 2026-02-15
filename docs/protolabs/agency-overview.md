# ProtoLabs Agency System — Overview

## What It Is

ProtoLabs is a fully autonomous software development agency powered by AI agents. It takes ideas from any source — human conversation, Discord messages, Linear issues, GitHub — and transforms them into shipped, tested, merged code through a repeatable, measurable loop.

The system doesn't just execute. It plans, challenges its own plans, breaks work into measurable pieces, delegates to specialized agents, monitors quality, and — critically — reflects on what it learned and feeds that back into better future work.

**The loop: IDEA → RESEARCH → EXPAND → EXECUTE → REFLECT → REPEAT**

## Why It Matters

### The Problem With AI-Assisted Development Today

Most AI coding tools operate at the wrong altitude. They help you write a function or fix a bug. ProtoLabs operates at the **organizational** level — it's not a tool, it's a **team**.

The gap between "AI can write code" and "AI can run a development organization" is:

- **Planning**: Who decides what to build and why?
- **Quality gates**: Who challenges bad ideas before they waste execution cycles?
- **Coordination**: How do parallel workstreams avoid conflicts?
- **Accountability**: How do you know if the work was worth doing?
- **Learning**: How does the org get smarter over time?

### The ProtoLabs Answer

Every human development org has these roles: product (what), engineering (how), QA (quality), PM (when), and leadership (why). ProtoLabs fills these with specialized AI agents that communicate through well-defined interfaces:

| Role                | Agent           | Responsibilities                                            |
| ------------------- | --------------- | ----------------------------------------------------------- |
| CEO / Visionary     | Josh (human)    | Ideas, direction, final approval                            |
| Chief of Staff      | Ava             | Triage, orchestration, quality gates, antagonistic review   |
| GTM / Strategy      | Jon             | Market perspective, customer value, content, positioning    |
| Project Manager     | ProjM           | Deep research, milestone decomposition, dependency planning |
| Engineering Manager | EM              | PR pipeline, merge strategy, build health                   |
| Backend Engineer    | Agents (Sonnet) | Feature implementation in worktrees                         |
| Frontend Engineer   | Matt            | UI components, design systems, Storybook                    |
| DevOps              | Frank           | Infrastructure health, deploys, monitoring                  |
| PR Maintainer       | Crew (Haiku)    | Auto-merge, format fixes, CodeRabbit resolution             |
| Board Janitor       | Crew (Haiku)    | Board consistency, orphaned features, stale deps            |

## Three Surfaces, Clear Separation

ProtoLabs operates across three systems that each own a distinct layer:

### Linear — Strategic Layer (Source of Truth)

- Vision, goals, initiatives, projects, roadmap
- Human reviews happen here
- Clients see progress here
- The "exec team" view

### Automaker Board — Tactical Layer

- Features, agents, branches, PRs, task execution
- Where code actually gets written
- Agent worktrees, auto-mode, dependency chains
- The "dev team" view

### Discord — Communication Layer

- Async team coordination
- Status updates, alerts, ceremonies
- Josh ↔ Ava primary channel
- The "office" view

**Rule: Never mix the layers.** Linear doesn't track individual PRs. Automaker doesn't own roadmap vision. Discord doesn't store state.

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

They challenge each other. The output is a consolidated plan that has survived cross-functional scrutiny.

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

### 5. Execution

Auto-mode processes features in dependency order:

- Creates isolated git worktrees
- Routes to appropriate agent model (Haiku for small, Sonnet for medium, Opus for architectural)
- Agent implements, tests, verifies
- On failure: iterate with more context, escalate model, or flag for human help

### 6. PR Pipeline

Automated quality assurance:

- Rebase on latest main
- Format fixes (Prettier)
- Push + create PR
- CI checks (build, test, format, audit)
- CodeRabbit AI review
- Thread resolution
- Auto-merge (squash to main)

### 7. Reflection

When an epic completes:

- **Retro**: What worked, what didn't, what to change
- **Metrics**: Cost, duration, failure rate, agent model distribution
- **Knowledge capture**: Update memory files with lessons learned
- **Improvement tickets**: Auto-create tasks from identified friction points
- **Changelog**: Generate human-readable summary of what shipped

The reflection loop is what makes this a **learning system**, not just an execution engine. Every project makes the next project better.

## The Revenue Model

No SaaS, no subscriptions, no obligations. Indie maker, not startup.

1. **Free tool**: protoMaker is source-available. Builds community trust and distribution.
2. **$49 lifetime Pro**: Written tutorials, agent templates, prompt library, methodology guide. One-time payment, lifetime access.
3. **Consulting (setupLab)**: Help organizations set up their own proto labs. Organic inbound from community trust, not outbound sales.

The system is both the product and the factory that makes the product. Every project generates content and proves the methodology.

## What Makes This Different

- **Not a copilot** — it's a team. Multiple specialized agents with defined roles and communication protocols.
- **Not one-shot** — it's a loop. Continuous improvement feeds learning back into planning.
- **Not just code** — it's organizational. Planning, review, execution, reflection, knowledge management.
- **Not a black box** — it's observable. Linear for strategy, Automaker board for tactics, Discord for communication. Full audit trail.
- **Not static** — it's self-improving. The system upgrades itself through the same pipeline it uses for customer work.
