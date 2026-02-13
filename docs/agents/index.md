# Agent System Documentation

Welcome to Automaker's agent system documentation. This guide helps contributors understand how agents work, how to create new agents, and how the system coordinates autonomous AI teammates.

## Quick Start

**New to Automaker's agents?** Start here:

1. Read [Architecture Overview](./architecture.md) for the big picture
2. Read [Context System](./context-system.md) to understand how agents get project knowledge
3. Try one of the guides below based on your goal

## Documentation Structure

### Core Concepts

#### [Architecture Overview](./architecture.md)

**Start here for the big picture.**

Covers:

- Core concepts (Skills, Subagents, Agent Teams)
- Architecture layers (Interface → Service → Provider → SDK)
- Execution model (how agents run)
- Agent types (Interactive, Feature Execution, Authority)
- Context system overview

**Read this if:** You're new to Automaker or want to understand how agents work.

### Agent Development

#### [Dynamic Role Registry](./dynamic-role-registry.md)

**Template-based agent creation and execution**

Covers:

- Agent Template Schema (Zod-validated)
- RoleRegistryService (in-memory template storage with tier enforcement)
- AgentFactoryService (create configs from templates with overrides/inheritance)
- DynamicAgentExecutor (execute with system prompt assembly and tool filtering)
- Assignment routing (Discord, Linear, GitHub)
- End-to-end flow

**Read this if:** You want to create custom agent types, understand how agents are configured at runtime, or build on the template system.

#### [Adding Agent Teammates](./adding-teammates.md)

**How to add new authority agents (PM, EM, Designer, etc.)**

Covers:

- What are authority agents?
- When to add a new teammate
- Step-by-step creation guide
- Example: Designer Agent
- Testing strategies

**Read this if:** You want to add a new autonomous team member (QA agent, Security agent, DevOps agent, etc.)

#### [Creating Agent Teams](./creating-agent-teams.md)

**How to build multi-agent coordination systems**

Covers:

- Agent team architecture
- Coordination patterns (sequential, parallel, review loops, monitoring)
- Event-driven communication
- Shared state management
- Example: Security Review Team
- Best practices

**Read this if:** You want to build a multi-agent system where agents coordinate to accomplish complex goals.

#### [Agile Ceremonies](./ceremonies.md)

**Automated standups, retros, and project retrospectives**

Covers:

- Ceremony types (milestone standup, milestone retro, project retro)
- Configuration in `.automaker/settings.json`
- Event flow (ProjM → CeremonyService → Discord)
- Content examples
- Planned ceremonies (board groom, doc generation)

**Read this if:** You want to understand how automated ceremonies work, configure them for a project, or add new ceremony types.

### Integration

#### [MCP Integration](./mcp-integration.md)

**How MCP tools interact with agents**

Covers:

- What is MCP?
- Automaker's MCP architecture
- MCP → Agent execution flow
- Available MCP tools (32 tools documented)
- Creating new MCP tools
- Context passing

**Read this if:** You want to control agents programmatically or understand how the Chief of Staff agent triggers agents.

#### [Context System Deep Dive](./context-system.md)

**How project knowledge flows into agent prompts**

Covers:

- Context sources (context files, memory files, CLAUDE.md)
- Context loading flow
- Memory system and smart selection
- Relevance ranking algorithm
- Usage tracking
- Creating context files
- Best practices

**Read this if:** You want to understand how agents get project-specific knowledge or how to add new context files.

## Common Tasks

### "I want to add a new agent that reviews code for security issues"

1. Read [Adding Agent Teammates](./adding-teammates.md)
2. Follow the step-by-step guide
3. Reference [Creating Agent Teams](./creating-agent-teams.md) if it needs to coordinate with other agents
4. See the Designer Agent example for a similar pattern

### "I want to build a multi-agent system for automated testing"

1. Read [Architecture Overview](./architecture.md) first
2. Then read [Creating Agent Teams](./creating-agent-teams.md)
3. Follow the Security Review Team example (similar pattern)
4. Check [MCP Integration](./mcp-integration.md) for how to trigger it

### "I want to add project-specific rules for agents to follow"

1. Read [Context System Deep Dive](./context-system.md)
2. Create a context file in `.automaker/context/`
3. Or use the MCP tool: `mcp__automaker__create_context_file()`

### "I want to control agents programmatically"

1. Read [MCP Integration](./mcp-integration.md)
2. Use existing MCP tools or create new ones
3. See the tool catalog for available operations

### "I want to understand how agents execute"

1. Read [Architecture Overview](./architecture.md) - Execution Model section
2. Follow the execution flow diagrams
3. Reference [MCP Integration](./mcp-integration.md) for the full MCP → Agent flow

## Key Concepts Reference

### Skills

**Reusable CLI commands** (e.g., `/ava`, `/board`, `/headsdown`)

- Interface layer, not execution layer
- Trigger different modes or workflows
- **Claude Docs:** [Skills explained](https://claude.com/blog/skills-explained)

### Subagents

**Independent agents with custom prompts/tools** (e.g., explore, plan, deepdive)

- Run in isolated context windows
- Purpose-built for specific workflows
- **Claude Docs:** [Create custom subagents](https://code.claude.com/docs/en/sub-agents)

### Agent Teams

**Multiple agents coordinating autonomously** (e.g., PM, ProjM, EM)

- Event-driven coordination
- Shared state via feature data
- **Claude Docs:** [Agent Teams](https://code.claude.com/docs/en/agent-teams)

### Authority Agents

**Autonomous team members** with specific responsibilities

- Event-driven triggers (idea-injected, pr-created, etc.)
- Policy-gated state transitions
- Discord integration for human oversight
- Examples: PM, ProjM, EM, Status Agent

### Context System

**How agents get project knowledge**

- Context files (`.automaker/context/`) - universal rules
- Memory files (`.automaker/memory/`) - learnings from past work
- Smart selection based on task relevance
- Usage tracking for prioritization

### MCP Tools

**Programmatic API for controlling Automaker**

- 32 tools for features, agents, auto-mode, context, etc.
- Used by the Chief of Staff agent and external integrations
- **Official Docs:** [MCP Specification](https://spec.modelcontextprotocol.io/)

## Architecture Layers (Quick Reference)

```
┌─────────────────────────────────────────────────────────────┐
│  Interface Layer: MCP, CLI Skills, Web UI                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Service Layer: AgentService, AutoModeService, Authority    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Registry Layer: RoleRegistry, AgentFactory, Executor       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Provider Layer: ProviderFactory, ClaudeProvider, etc.      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Execution Layer: @anthropic-ai/claude-agent-sdk            │
└─────────────────────────────────────────────────────────────┘
```

## Current Agent Team

### Interactive Agents (CLI + Discord)

These agents can be invoked interactively via CLI skills or Discord.

| Role              | Model  | Trigger                 | Location                               |
| ----------------- | ------ | ----------------------- | -------------------------------------- |
| Chief of Staff    | Opus   | CLI, Discord, crew loop | `services/built-in-templates.ts`       |
| DevOps Engineer   | Sonnet | CLI, Discord, crew loop | `services/crew-members/frank-check.ts` |
| Frontend Engineer | Sonnet | CLI, Discord            | `services/built-in-templates.ts`       |
| GTM Specialist    | Sonnet | CLI, Discord, crew loop | `services/built-in-templates.ts`       |

### Crew Loop Members (Scheduled)

These run lightweight checks on cron schedules and escalate to full agents only when problems are detected. See [Crew Loops](../dev/crew-loops.md) for details.

| Member          | Model  | Schedule | Checks                                                    |
| --------------- | ------ | -------- | --------------------------------------------------------- |
| Chief of Staff  | Opus   | 10 min   | Stuck agents, blocked features, auto-mode health          |
| DevOps Engineer | Sonnet | 10 min   | V8 heap, RSS memory, agent capacity, health monitor       |
| PR Maintainer   | Haiku  | 10 min   | Stale PRs, auto-merge status, orphaned worktrees          |
| Board Janitor   | Haiku  | 15 min   | Merged-not-done, orphaned in-progress, stale dependencies |
| GTM Specialist  | Sonnet | 6 hours  | Recently completed features (disabled by default)         |

### Implementation Agents (Auto-Mode)

These agents are assigned features dynamically by auto-mode and implement them in isolated worktrees.

| Template               | Model  | Purpose                                  |
| ---------------------- | ------ | ---------------------------------------- |
| Backend Engineer       | Sonnet | Server-side features, APIs, services     |
| Frontend Engineer      | Sonnet | UI components, design system, styling    |
| QA Engineer            | Sonnet | Tests, bug identification, validation    |
| Documentation Engineer | Haiku  | Docs, READMEs, API guides                |
| Product Manager        | Sonnet | Requirements, priorities, roadmap        |
| Engineering Manager    | Sonnet | Code review, capacity, quality standards |

- Run in isolated worktrees
- Create PRs on completion
- **Trigger:** Auto-mode loop or manual `start_agent`
- **Model selection:** Based on feature complexity (Haiku → Sonnet → Opus auto-escalation)
- **Location:** `apps/server/src/services/auto-mode-service.ts`

### Authority Agents (Dormant)

These event-driven agents exist in code but aren't actively staffed yet.

| Agent        | Trigger                  | Purpose                     | Location                                                    |
| ------------ | ------------------------ | --------------------------- | ----------------------------------------------------------- |
| PM           | `idea:injected` event    | Research ideas, create PRDs | `apps/server/src/services/authority-agents/pm-agent.ts`     |
| ProjM        | `prd:approved` event     | Decompose into milestones   | `apps/server/src/services/authority-agents/projm-agent.ts`  |
| EM           | `decomposition:complete` | Technical feasibility       | `apps/server/src/services/authority-agents/em-agent.ts`     |
| Status Agent | Periodic polling         | Progress monitoring         | `apps/server/src/services/authority-agents/status-agent.ts` |

## Official Claude Resources

- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Building agents with Claude SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Skills Explained](https://claude.com/blog/skills-explained)
- [Create Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- [Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [MCP Specification](https://spec.modelcontextprotocol.io/)

## Contributing

**Found a bug or want to improve documentation?**

- File an issue: https://github.com/anthropics/claude-code/issues
- Or submit a PR with your improvements

**Questions?**

- Check the official docs above
- Ask in Discord community channel
- Or open a discussion on GitHub

---

**Ready to build?** Pick a guide above and start creating!
