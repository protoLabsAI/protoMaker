# Getting Started

protoLabs is an AI development studio. You describe features. AI agents build them in isolated git branches and create PRs. You review and merge.

## How It Works

```
You create a feature → Agent claims it → Works in isolated branch → Creates PR → You review & merge
```

1. **Describe what you want** — Create a feature on the board with a title and description
2. **Agent picks it up** — Auto-mode assigns an AI agent based on complexity
3. **Isolated execution** — The agent works in a git worktree, protecting your main branch
4. **PR for review** — When done, the agent creates a pull request
5. **Merge and ship** — Review the PR, merge it, feature moves to done

## Quick Tutorial

Walk through the core workflow: create a feature, let an agent implement it, and merge the PR.

### Step 1: Start the Server

```bash
cd /path/to/your-project
npm run dev:web   # Starts UI on :3007, server on :3008
```

Open `http://localhost:3007` in your browser. You'll see the Kanban board.

### Step 2: Create a Feature

Click "New Feature" or use the CLI:

```bash
claude
> /board create
```

Give it a title and description. Be specific — the agent will implement exactly what you describe:

```markdown
## Title

Add health check endpoint

## Description

Create a GET /api/health endpoint that returns { status: "ok", uptime: process.uptime() }.
Add it to the existing Express router in src/routes/index.ts.

## Acceptance Criteria

- [ ] GET /api/health returns 200 with JSON body
- [ ] Response includes status and uptime fields
- [ ] No new dependencies added
```

The feature appears in the **backlog** column.

### Step 3: Start Auto-Mode

Auto-mode picks up backlog features and assigns agents:

```bash
/auto-mode start
```

Or click the auto-mode toggle in the UI.

The agent:

1. Creates a git worktree for isolation
2. Reads the codebase to understand patterns
3. Implements the feature
4. Runs build verification
5. Creates a PR

### Step 4: Review the PR

The feature moves to the **review** column. The agent's PR includes:

- All code changes
- A summary of what was implemented
- CodeRabbit AI review (if configured)
- CI check results (build, test, format, lint)

Review the PR on GitHub. If changes are needed, comment on the PR — the agent can address feedback automatically (see [PR Remediation Loop](../dev/pr-remediation-loop.md)).

### Step 5: Merge

Once satisfied, merge the PR. The feature automatically moves to **done**.

## Pipeline Overview

For complex work (ideas, projects, multi-feature efforts), protoLabs runs a 9-phase pipeline:

```
Signal → TRIAGE → RESEARCH → SPEC → SPEC_REVIEW → DESIGN → PLAN → EXECUTE → VERIFY → PUBLISH
                                          ⬆ GATE                                 ⬆ GATE
```

**Fast path** (most common): Create a feature directly on the board → EXECUTE → VERIFY → PUBLISH. Use this when you know exactly what needs building.

**Full path**: Submit an idea → PM Agent researches → SPARC PRD → human review → ProjM decomposes into milestones → agents implement each feature.

For the complete pipeline reference, see [Idea to Production](../dev/idea-to-production.md).

## Key Concepts

### Features

Features are units of work on the Kanban board. Each has a status:

| Status        | Meaning                             |
| ------------- | ----------------------------------- |
| `backlog`     | Queued, ready to start              |
| `in_progress` | Being worked on by an agent         |
| `review`      | PR created, under review            |
| `blocked`     | Temporarily halted                  |
| `done`        | PR merged, work complete            |
| `verified`    | Quality checks passed (Ralph loops) |

### Agents

AI agents powered by Claude execute features. Named personas own specific domains:

| Agent | Domain                                | Model  |
| ----- | ------------------------------------- | ------ |
| Matt  | Frontend (React, UI, Tailwind)        | Sonnet |
| Kai   | Backend (Express, services, APIs)     | Sonnet |
| Sam   | Agent infra (LangGraph, providers)    | Sonnet |
| Frank | DevOps (Docker, CI/CD, deploy)        | Sonnet |
| Cindi | Content (blog posts, docs, SEO)       | Sonnet |
| Ava   | Orchestration (routing, coordination) | Opus   |

Model selection is automatic: Haiku for small tasks, Sonnet for standard work (default), Opus for architectural changes. Features that fail 2+ times auto-escalate to the next model tier.

### Worktrees

Every feature runs in an isolated [git worktree](https://git-scm.com/docs/git-worktree). This means agents can work on multiple features simultaneously without conflicts, and your main branch stays clean.

### Dependencies

Features can depend on other features. A dependent feature won't start until its dependencies are done. Use `/orchestrate` to visualize and manage the dependency graph.

### Context Files

Files in `.automaker/context/` are automatically injected into every agent's prompt. Use them for coding standards, architectural rules, and project-specific conventions. See [Context System](../agents/context-system.md).

## Core Architecture

protoLabs is built as three surfaces that share the same agent infrastructure:

```
┌──────────────────────────────────────────────┐
│  UI Board (localhost:3007)                    │
│  Visual Kanban, agent runner, flow graph     │
├──────────────────────────────────────────────┤
│  CLI / MCP (Claude Code plugin)              │
│  /board, /auto-mode, /plan-project, 120+ tools│
├──────────────────────────────────────────────┤
│  Autonomous Pipeline                          │
│  Auto-mode, Lead Engineer, PR remediation    │
└──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│  Shared Infrastructure                        │
│  Agent templates, worktree isolation,        │
│  context loading, event bus, Langfuse tracing│
└──────────────────────────────────────────────┘
```

The same agent templates (Matt, Kai, Sam, etc.) serve all three surfaces. Whether you're chatting with `/matt` in the CLI or auto-mode is running Matt on a frontend feature, it's the same prompt, same tools, same domain knowledge.

## Data Storage

protoLabs stores data in two locations:

**Per-project** (`.automaker/` in your repo):

- `features/` — Feature JSON files and agent output
- `context/` — Context files injected into agent prompts
- `memory/` — Learnings from past agent work
- `settings.json` — Project-specific configuration

**Global** (`./data` in the server directory):

- `settings.json` — Global settings and API keys
- `agent-sessions/` — Conversation histories

## Next Steps

### Understand the Agent System

- **[Agent Philosophy](../agents/philosophy.md)** — Why named personas, model tiers, and worktree isolation
- **[Architecture Overview](../agents/architecture.md)** — Technical implementation of the agent system
- **[Reliability & Recovery](../agents/reliability.md)** — How failures are handled automatically

### Customize Agent Behavior

- **[Prompt Engineering](../agents/prompt-engineering.md)** — How prompts are composed and how to modify them
- **[Context System](../agents/context-system.md)** — Add project-specific rules for agents

### Deploy and Integrate

- **[Installation (Fedora/RHEL)](./installation-fedora)** — Install the desktop app on Linux
- **[Deployment Options](../infra/deployment)** — Docker, systemd, and staging setups
- **[MCP Plugin](../integrations/claude-plugin)** — Control protoLabs from Claude Code CLI

### Go Deeper

- **[Idea to Production](../dev/idea-to-production.md)** — The full 9-phase pipeline reference
- **[Project Lifecycle](../dev/project-lifecycle.md)** — Linear-driven project state machine
- **[Engine Architecture](../archived/engine-architecture.md)** — ADR for the Lead Engineer design
