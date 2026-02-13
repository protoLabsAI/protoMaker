# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automaker is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Important Guidelines

- **Dev Server Management**: NEVER start, stop, restart, or otherwise manage the dev server yourself. Always ask the user to manage it, or you will break it.
- **Document as you build**: When adding or changing a feature, update the relevant docs in `docs/`. New services get a page in the appropriate section. New config options get added to env var tables. API changes get reflected in the server reference. Follow the rules in `docs/dev/docs-standard.md` — every page must belong to a sidebar section, use `kebab-case.md` naming, and stay under 800 lines. If no appropriate section exists, add the page to the closest match rather than creating a new root-level file.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:web             # Web browser mode (localhost:3007)
npm run dev:electron        # Desktop app mode
npm run dev:electron:debug  # Desktop with DevTools open

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
npm run build:electron      # Build desktop app for current platform
npm run build:server        # Build server only

# Testing
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # All shared package tests
npm run test:all            # All tests (packages + server)

# Single test file
npm run test:server -- tests/unit/specific.test.ts

# Linting and formatting
npm run lint                # ESLint
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Architecture

### Monorepo Structure

```
automaker/
├── apps/
│   ├── ui/           # React + Vite + Electron frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
└── libs/             # Shared packages (@automaker/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    ├── policy-engine/     # Trust-based policy checking for authority system
    ├── spec-parser/       # XML/markdown spec parsing for project plans
    └── git-utils/    # Git operations & worktree management
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@automaker/types (no dependencies)
    ↓
@automaker/utils, @automaker/prompts, @automaker/platform, @automaker/model-resolver, @automaker/dependency-resolver, @automaker/policy-engine, @automaker/spec-parser
    ↓
@automaker/git-utils
    ↓
@automaker/server, @automaker/ui
```

### Key Technologies

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **Testing**: Playwright (E2E), Vitest (unit)

### Server Architecture

The server (`apps/server/src/`) follows a modular pattern:

- `routes/` - Express route handlers organized by feature (agent, features, auto-mode, worktree, etc.)
- `services/` - Business logic (AgentService, AutoModeService, FeatureLoader, TerminalService, AuthorityService, PRFeedbackService)
- `services/authority-agents/` - AI authority agents (PM, ProjM, EM, Status, Discord approval routing)
- `providers/` - AI provider abstraction (currently Claude via Claude Agent SDK)
- `lib/` - Utilities (events, auth, worktree metadata)
- `routes/linear/` - Linear agent integration (OAuth + webhook)

### Multi-Agent Architecture

Automaker uses a dynamic role registry and factory pattern for agents:

- **Role Registry** (`RoleRegistryService`) — Stores agent templates (role, system prompt, tools, model). Built-in templates registered at startup.
- **Agent Factory** (`AgentFactoryService`) — Creates agent instances from templates. Resolves models, injects context.
- **Dynamic Executor** (`DynamicAgentExecutor`) — Runs agents in worktrees with the Claude Agent SDK.
- **Linear Agent Integration** — OAuth `actor=app` flow registers Automaker as an agent in Linear. `AgentSessionEvent` webhooks route mentions/delegations to the appropriate agent.

Agent roles are defined as templates with a schema validated by Zod. New agent types can be added via the REST API (`/api/agents`) or MCP tools without code changes.

### Frontend Architecture

The UI (`apps/ui/src/`) uses:

- `routes/` - TanStack Router file-based routing
- `components/views/` - Main view components (board, settings, terminal, etc.)
- `store/` - Zustand stores with persistence (app-store.ts, setup-store.ts)
- `hooks/` - Custom React hooks
- `lib/` - Utilities and API client

## Data Storage

### Per-Project Data (`.automaker/`)

```
.automaker/
├── features/              # Feature JSON files and images
│   └── {featureId}/
│       ├── feature.json
│       ├── agent-output.md
│       └── images/
├── context/               # Context files for AI agents (CLAUDE.md, etc.)
├── settings.json          # Project-specific settings
├── spec.md               # Project specification
└── analysis.json         # Project structure analysis
```

### Global Data (`DATA_DIR`, default `./data`)

```
data/
├── settings.json          # Global settings, profiles, shortcuts
├── credentials.json       # API keys
├── sessions-metadata.json # Chat session metadata
└── agent-sessions/        # Conversation histories
```

## Import Conventions

Always import from shared packages, never from old paths:

```typescript
// ✅ Correct
import type { Feature, ExecuteOptions } from '@automaker/types';
import { createLogger, classifyError } from '@automaker/utils';
import { getEnhancementPrompt } from '@automaker/prompts';
import { getFeatureDir, ensureAutomakerDir } from '@automaker/platform';
import { resolveModelString } from '@automaker/model-resolver';
import { resolveDependencies } from '@automaker/dependency-resolver';
import { getGitRepositoryDiffs } from '@automaker/git-utils';

// ❌ Never import from old paths
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

## Key Patterns

### Event-Driven Architecture

All server operations emit events that stream to the frontend via WebSocket. Events are created using `createEventEmitter()` from `lib/events.ts`.

### Git Worktree Isolation

Each feature executes in an isolated git worktree, protecting the main branch during AI agent execution. Worktrees are **auto-created** when an agent starts if one doesn't exist for the feature's branch. Worktrees are stored in `{projectPath}/.worktrees/{branch-name}`.

### Context Files

Project-specific rules are stored in `.automaker/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@automaker/utils`.

### Model Resolution

Use `resolveModelString()` from `@automaker/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5-20251001`
- `sonnet` → `claude-sonnet-4-5-20250929`
- `opus` → `claude-opus-4-5-20251101`

### Crew Loop System

Scheduled health checks and automated escalation for crew members. Lightweight in-process checks run on cron schedules — full agent escalation only when problems are detected.

```
SchedulerService (cron tick)
  --> CrewLoopService.runCheck(memberId)
    --> member.check(context) — lightweight, no API calls
      --> IF needsEscalation: DynamicAgentExecutor.execute(template, prompt)
      --> ELSE: log "ok", emit event, done
```

**Current crew members:**

| Member        | Schedule       | Checks                                                                   | Escalation           |
| ------------- | -------------- | ------------------------------------------------------------------------ | -------------------- |
| Ava           | `*/10 * * * *` | Stuck agents (>2h), blocked features, auto-mode health, capacity         | Warning+ findings    |
| Frank         | `*/10 * * * *` | V8 heap, RSS memory, agent capacity, health monitor                      | Critical issues only |
| PR Maintainer | `*/10 * * * *` | Stale PRs (>24h), review features needing auto-merge, orphaned worktrees | Warning+ findings    |
| Board Janitor | `*/15 * * * *` | Merged PRs still in review, orphaned in-progress (>4h), stale deps       | Warning+ findings    |
| GTM           | `0 */6 * * *`  | Recently completed features (placeholder)                                | Disabled by default  |

Ava acts as orchestrator — PR pipeline monitoring is delegated to PR Maintainer, board consistency to Board Janitor. Both run on Haiku for cost efficiency.

**Adding a new crew member** = one file implementing `CrewMemberDefinition` in `apps/server/src/services/crew-members/`, then register with `crewLoopService.registerMember(def)` in `index.ts`. See `docs/dev/crew-loops.md` for full details.

**API:** `GET /api/crew/status`, `POST /api/crew/:id/{trigger,enable,disable,schedule}`

### Feature Status System

Automaker uses a canonical **6-status system** for all features:

```
backlog → in_progress → review → done
             ↓           ↓
          blocked ← ← ← ┘

          (verified = Ralph terminal state)
```

**Status Definitions:**

- `backlog` - Queued, ready to start (consolidates: pending, ready)
- `in_progress` - Being worked on (consolidates: running)
- `review` - PR created, under review
- `blocked` - Temporary halt (consolidates: failed)
- `done` - PR merged, work complete (consolidates: completed, waiting_approval)
- `verified` - Quality checks passed (Ralph autonomous loops)

**Migration:** Legacy statuses are automatically normalized on read by `FeatureLoader`. No manual migration required. See `docs/feature-status-system.md` for details.

### Model Hierarchy for Auto-Mode

Auto-mode uses a tiered model selection based on feature complexity:

| Model      | Use Case                                                 | Triggered By                                       |
| ---------- | -------------------------------------------------------- | -------------------------------------------------- |
| **Opus**   | Orchestration, architectural decisions, challenging work | `complexity: 'architectural'` or after 2+ failures |
| **Sonnet** | Standard feature implementation (default)                | `complexity: 'medium'` or `'large'`                |
| **Haiku**  | Trivial/quick tasks                                      | `complexity: 'small'`                              |

**Auto-escalation:** Features that fail 2+ times automatically escalate to opus on retry.

**Setting complexity via MCP:**

```typescript
mcp__automaker__create_feature({
  projectPath: '/path/to/project',
  title: 'Core Infrastructure Setup',
  description: '...',
  complexity: 'architectural', // Uses opus
});
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key (or use Claude Code CLI auth)
- `HOST` - Host to bind server to (default: 0.0.0.0)
- `HOSTNAME` - Hostname for user-facing URLs (default: localhost)
- `PORT` - Server port (default: 3008)
- `DATA_DIR` - Data storage directory (default: ./data)
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `AUTOMAKER_MOCK_AGENT=true` - Enable mock agent mode for CI testing
- `AUTOMAKER_AUTO_LOGIN=true` - Skip login prompt in development (disabled when NODE_ENV=production)
- `VITE_HOSTNAME` - Hostname for frontend API URLs (default: localhost)

## MCP Server & Claude Code Plugin

Automaker includes an MCP server and Claude Code plugin for programmatic control.

### Quick Setup

```bash
# 1. Ensure AUTOMAKER_API_KEY is set in your environment
# (set in packages/mcp-server/plugins/automaker/.env)

# 2. Build the MCP server
npm run build:packages

# 3. Add the plugin marketplace and install
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
claude plugin install automaker
```

### Available MCP Tools

The MCP server exposes 42+ tools organized by category:

**Feature Management:** `list_features`, `get_feature`, `create_feature`, `update_feature`, `delete_feature`, `move_feature`

**Agent Control:** `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent`

**Queue Management:** `queue_feature`, `list_queue`, `clear_queue`

**Context Files:** `list_context_files`, `get_context_file`, `create_context_file`, `delete_context_file`

**Project Spec:** `get_project_spec`, `update_project_spec`

**Orchestration:** `set_feature_dependencies`, `get_dependency_graph`, `start_auto_mode`, `stop_auto_mode`, `get_auto_mode_status`, `get_execution_order`

**Project Orchestration:** `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `create_project_features`

**Agent Templates:** `list_agent_templates`, `get_agent_template`, `register_agent_template`, `update_agent_template`, `unregister_agent_template`, `execute_dynamic_agent`, `get_role_registry_status`

**GitHub Operations:** `merge_pr`, `check_pr_status`, `resolve_review_threads`

**Utilities:** `health_check`, `get_board_summary`

### Plugin Commands

- `/board` - View and manage the Kanban board
- `/auto-mode` - Start/stop autonomous feature processing
- `/orchestrate` - Manage feature dependencies
- `/context` - Manage context files for AI agents

See `docs/claude-plugin.md` for the complete guide.

## Project Orchestration System

Automaker supports hierarchical project planning with the flow:

**Deep Research → SPARC PRD → Review → Approval → Scaffold → Features**

### Project Structure

```
.automaker/projects/{project-slug}/
├── project.md           # Project overview
├── project.json         # Full project data
├── prd.md              # SPARC PRD document
└── milestones/
    └── {milestone-slug}/
        ├── milestone.md
        └── phase-{N}-{name}.md
```

### Project Types (libs/types/src/project.ts)

```typescript
import type { Project, Milestone, Phase, SPARCPrd } from '@automaker/types';

// Project status lifecycle
type ProjectStatus =
  | 'researching'
  | 'drafting'
  | 'reviewing'
  | 'approved'
  | 'scaffolded'
  | 'active'
  | 'completed';

// Phase complexity for estimation
type PhaseComplexity = 'small' | 'medium' | 'large';
```

### Project API Routes

The server exposes project endpoints at `/api/projects/`:

- `POST /list` - List all project plans
- `POST /get` - Get project with milestones and phases
- `POST /create` - Create project and scaffold files
- `POST /update` - Update project properties
- `POST /delete` - Delete project and files
- `POST /create-features` - Convert phases to board features with epic support

### Epic Support

Features can be organized into epics for milestone grouping:

```typescript
interface Feature {
  // ... existing fields
  isEpic?: boolean; // True if this is an epic (container feature)
  epicId?: string; // Parent epic ID (for child features)
  epicColor?: string; // Badge color (hex)
  isFoundation?: boolean; // Downstream deps wait for merge (not just review)
}
```

### Epic Git Workflow

When features belong to an epic, the git workflow follows a hierarchical PR structure:

```
main
  ↑
epic/foundation ──────────── Epic PR (targets main)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

**Automatic Behavior:**

- Feature PRs automatically target their epic's branch (not main)
- Epic PRs target main
- Features without an epic target main directly

**Merge Order:**

1. Merge all feature PRs into the epic branch
2. Once all features complete, merge the epic PR into main

This keeps main clean while allowing incremental feature development within epics.

## Graphite Integration

Automaker supports [Graphite](https://graphite.dev) for stack-aware PR management.

### Setup

1. Install Graphite CLI: `npm install -g @withgraphite/graphite-cli`
2. Authenticate: `gt auth --token <your-token>`
3. Sync your repo in [Graphite settings](https://app.graphite.com/settings/synced-repos)
4. Join/create a team for your org in [Graphite team settings](https://app.graphite.com/settings)

### Usage with Epics

Graphite excels at managing stacked PRs for the epic workflow:

```bash
# Track epic branch
gt track epic/my-epic --parent main

# Track feature branch under epic
gt track feature/my-feature --parent epic/my-epic

# Submit all PRs in stack
gt submit --stack

# View stack
gt log short
```

### Fallback Behavior

If Graphite is not available or not synced, Automaker falls back to standard git/gh CLI commands. The git workflow service automatically:

- Uses `gt submit` when Graphite is available
- Falls back to `gh pr create` with proper `--base` targeting otherwise
- Feature PRs auto-target their epic branch (not main)

### Tips

- Epic branches need at least one commit before PRs can be created
- Use `gt sync` to keep your stack up to date with remote
- Use `gt restack` to rebase your stack after trunk changes

### Creating a Project via MCP

```typescript
// Create project plan
mcp__automaker__create_project({
  projectPath: '/path/to/project',
  title: 'My Feature',
  goal: 'Implement X functionality',
  prd: {
    situation: 'Current state...',
    problem: 'The issue is...',
    approach: 'We will...',
    results: 'Expected outcomes...',
    constraints: ['Constraint 1', 'Constraint 2'],
  },
  milestones: [
    {
      title: 'Foundation',
      description: 'Core infrastructure',
      phases: [
        {
          title: 'Add Types',
          description: 'Create TypeScript types...',
          filesToModify: ['src/types/index.ts'],
          acceptanceCriteria: ['Types compile', 'Exported correctly'],
          complexity: 'small',
        },
      ],
    },
  ],
});

// Convert to board features
mcp__automaker__create_project_features({
  projectPath: '/path/to/project',
  projectSlug: 'my-feature',
  createEpics: true,
  setupDependencies: true,
});
```
