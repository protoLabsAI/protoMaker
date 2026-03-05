# Agent Architecture Overview

This document provides a high-level overview of protoLabs's agent system architecture, execution model, and key concepts for contributors.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Architecture Layers](#architecture-layers)
- [Execution Model](#execution-model)
- [Agent Types](#agent-types)
- [Context System](#context-system)
- [Related Documentation](#related-documentation)

## Core Concepts

protoLabs's agent system is built on three key concepts from Claude's agent ecosystem:

### Skills

**What:** Reusable CLI commands that invoke specific modes or workflows
**protoLabs Examples:** `/ava` (Chief of Staff), `/board` (Kanban management), `/headsdown` (autonomous work mode)
**Claude Docs:** [Skills explained](https://claude.com/blog/skills-explained)

### Subagents

**What:** Independent Claude instances with custom prompts, tool restrictions, and isolated contexts
**protoLabs Examples:** Task tool agents (explore, plan, deepdive, deepcode), feature execution agents
**Claude Docs:** [Create custom subagents](https://code.claude.com/docs/en/sub-agents)

### Agent Teams

**What:** Multiple independent agents that coordinate autonomously via shared task lists
**protoLabs Examples:** Authority agents (PM, ProjM, EM) working together on idea → PRD → decomposition → execution pipeline
**Claude Docs:** [Agent Teams](https://code.claude.com/docs/en/agent-teams)

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Interface Layer                                            │
│  - MCP Tools (programmatic API)                            │
│  - CLI Skills (/ava, /board, etc.)                         │
│  - Web UI (agent-runner, board views)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Service Layer                                              │
│  - AgentService (interactive chat agents)                  │
│  - LeadEngineerService (feature lifecycle state machine)   │
│  - FeatureScheduler (scheduling loop, dep resolution)      │
│  - AutoModeService (orchestration, worktree management)    │
│  - AuthorityService + Authority Agents (PM, ProjM, EM)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Dynamic Role Registry                                      │
│  - RoleRegistryService (template storage + validation)     │
│  - AgentFactoryService (config creation from templates)    │
│  - DynamicAgentExecutor (execute with tool/prompt assembly)│
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Provider Layer                                             │
│  - ProviderFactory (routes model → provider)               │
│  - ClaudeProvider (native SDK)                             │
│  - CursorProvider, CodexProvider, OpencodeProvider         │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Execution Layer                                            │
│  - @anthropic-ai/claude-agent-sdk                          │
│  - Native SDK features: hooks, checkpointing, cost tracking│
│  - Session management, context compaction                   │
└─────────────────────────────────────────────────────────────┘
```

## Execution Model

### All Agents Use Native Claude SDK

**Every agent in protoLabs** (whether triggered by UI, CLI, or MCP) executes via the native Claude Agent SDK with full capabilities:

- ✅ **Cost tracking** - Every agent execution tracks `total_cost_usd`
- ✅ **File checkpointing** - Safe rollback on errors without git operations
- ✅ **Session resume** - Failed agents can continue from where they left off
- ✅ **Context management** - Automatic compaction and context window handling
- ✅ **Thinking budgets** - Extended thinking for complex reasoning tasks

### Execution Paths

#### 1. Interactive Agents (Agent Runner)

```
User → UI/CLI → AgentService.sendMessage()
  → ProviderFactory.getProviderForModel()
  → ClaudeProvider.executeQuery()
  → SDK query() with conversation history
  → Stream results back to UI via WebSocket
```

#### 2. Feature Execution Agents (Auto-Mode)

```
Feature (backlog) → FeatureScheduler.runLoop()
  → PipelineRunner.run() → LeadEngineerService.process()
  → State machine: INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DONE
  → EXECUTE phase:
    → Create worktree for isolation
    → Load context files (.automaker/context/, CLAUDE.md)
    → ProviderFactory → ClaudeProvider → SDK query()
    → Stream progress events via WebSocket
    → Create PR when complete → REVIEW phase
```

#### 3. Authority Agents (Autonomous Team)

```
Event (idea-injected) → PMAgent listens
  → Research codebase with read-only tools (Haiku)
  → Generate SPARC PRD (Sonnet)
  → Submit proposal → AuthorityService checks policy
  → Approved → ProjM picks up for decomposition
  → ProjM creates board features with dependencies
  → Features enter auto-mode execution pipeline
```

## Agent Types

### 1. Interactive Agents (AgentService)

**Purpose:** Chat-based agent runner for ad-hoc tasks
**Location:** `apps/server/src/services/agent-service.ts`
**Trigger:** UI Agent Runner, MCP `start_conversation` tool
**Context:** Conversation history, user messages, optional images
**Tools:** Full tool suite (Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task, Skill)

### 2. Feature Execution Agents (Lead Engineer Pipeline)

**Purpose:** Autonomous implementation of board features through a state machine
**Location:** `apps/server/src/services/lead-engineer-service.ts` (state machine), `apps/server/src/services/feature-scheduler.ts` (scheduling), `apps/server/src/services/auto-mode-service.ts` (orchestration)
**Trigger:** Auto-mode loop (via `FeatureScheduler`), MCP `start_agent` tool, UI "Start Agent" button
**Context:** Feature description, dependencies, context files, CLAUDE.md, project memory
**Tools:** Same as interactive agents, but with worktree isolation
**Special:** State machine lifecycle (INTAKE through DONE), model auto-escalation, session resume on failure, cost tracking per feature, PR creation on success

### 3. Authority Agents (Autonomous Team)

**Purpose:** Idea → PRD → decomposition → execution pipeline
**Location:** `apps/server/src/services/authority-agents/`
**Members:**

- **PM (Product Manager)** - Researches ideas, generates SPARC PRDs
- **ProjM (Project Manager)** - Decomposes PRDs into milestones/phases, creates board features
- **EM (Engineering Manager)** - Reviews technical feasibility, suggests refinements
- **Status Agent** - Monitors progress, escalates blockers, reports to Discord

**Trigger:** Event-driven (idea-injected, approval events, status checks)
**Context:** Codebase, project patterns, past decisions, authority policies
**Coordination:** Shared event bus, policy-gated state transitions

## Context System

### Context Sources (Priority Order)

1. **Conversation History** - Previous messages in the session
2. **Feature Context** - Feature description, dependencies, acceptance criteria
3. **Project Context Files** (`.automaker/context/`)
   - `CLAUDE.md` - Project overview and guidelines
   - `CODE_QUALITY.md` - Coding standards
   - Custom context files - Domain-specific rules
4. **Memory Files** (`.automaker/memory/`)
   - Learnings from past agent work
   - Smart selection based on task relevance
   - Usage tracking for prioritization
5. **SDK Settings Sources** (if `autoLoadClaudeMd: true`)
   - User-level CLAUDE.md (`~/.claude/CLAUDE.md`)
   - Project-level CLAUDE.md (duplicate filtered)

### Context Loading Flow

```typescript
// From libs/utils/src/context-loader.ts
const contextResult = await loadContextFiles({
  projectPath: '/path/to/project',
  fsModule: secureFs,
  taskContext: {
    title: 'Add authentication system',
    description: 'Implement OAuth2 with JWT tokens',
  },
  includeMemory: true,
  maxMemoryFiles: 5,
});

// Returns:
// - files: ContextFileInfo[] (from .automaker/context/)
// - memoryFiles: MemoryFileInfo[] (from .automaker/memory/, relevance-ranked)
// - formattedPrompt: string (ready to inject into system prompt)
```

**Memory Selection Algorithm:**

- Extracts terms from task title/description
- Matches terms against memory file frontmatter (tags, keywords)
- Scores by: term matches + usage frequency + importance level
- Returns top N files (default: 5)
- Increments usage stats for selected files

### Context Injection Points

| Agent Type        | Context Sources                                      | Injection Point                                     |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Interactive       | Conversation history, context files, memory          | `AgentService.sendMessage()` before SDK call        |
| Feature Execution | Feature data, context files, memory, CLAUDE.md       | `LeadEngineerService` EXECUTE phase before SDK call |
| Authority Agents  | Codebase patterns, authority policies, project goals | PM/ProjM/EM prompts in `authority-agents/*.ts`      |

## Related Documentation

- **[Dynamic Role Registry](./dynamic-role-registry.md)** - Template-based agent creation, factory, and execution
- **[Adding Agent Teammates](./adding-teammates.md)** - How to create new authority agents (PM, EM, Designer, QA)
- **[Creating Agent Teams](./creating-agent-teams.md)** - Building multi-agent coordination systems
- **[MCP Integration](./mcp-integration.md)** - How MCP tools interact with agents
- **[Context System](./context-system.md)** - Deep dive into context loading and memory

## Key Architectural Decisions

### 1. Provider Abstraction

**Why:** Support multiple AI providers (Claude, Cursor, Codex, OpenCode) without changing agent logic
**How:** `ProviderFactory` routes model IDs to appropriate provider implementations
**Benefit:** Easy to add new providers, users choose their preferred AI backend

### 2. Native SDK Everywhere

**Why:** Claude SDK provides battle-tested agent loop, context management, and advanced features
**When:** Migrated in Feb 2026 via "Agent Runner Evolution" project
**Benefit:** Cost tracking, session resume, file checkpointing, thinking budgets out-of-the-box

### 3. Worktree Isolation

**Why:** Feature agents need isolated environments to avoid conflicts
**How:** Each feature gets a dedicated git worktree based on its branch name
**Benefit:** Multiple agents can work in parallel without stepping on each other

### 4. Event-Driven Authority System

**Why:** Authority agents need to coordinate without tight coupling
**How:** Shared event bus (`EventEmitter`), policy-gated state transitions
**Benefit:** Loosely coupled, easy to add new agents, clear audit trail

---

**Next Steps:**

- Read [Adding Agent Teammates](./adding-teammates.md) to add a new authority agent
- Read [Creating Agent Teams](./creating-agent-teams.md) to build multi-agent coordination
- Read [MCP Integration](./mcp-integration.md) to understand tool-agent interaction
