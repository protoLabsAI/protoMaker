# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Philosophy: Greenfield-First

This is a greenfield codebase. We are building the future, not maintaining the past.

- **No backward compatibility.** When changing an interface, update ALL consumers immediately. Never add compat shims, deprecated aliases, re-exports, or `// legacy` comments. Old code dies the moment new code lands.
- **No mockups or stubs.** Build the real thing or don't build it. No placeholder implementations, fake data, or TODO-driven development.
- **No deprecation cycles.** If something is wrong, replace it. Don't mark it deprecated and hope someone cleans it up later.
- **No shortcuts.** Do it right the first time. If that means touching 10 files to propagate a type change, touch 10 files.
- **Do things correctly or not at all.** Every line of code should be production-quality from day one.

## Planning & Approach

- When creating plans, start with the minimal viable scope. Do NOT propose multi-phase plans unless explicitly asked. Default to the smallest, lowest-risk approach first.
- Do not exit plan mode or transition away from planning until the user explicitly confirms the plan is complete and approved. Wait for user signal before proceeding to implementation.

## Git Workflow

This repo uses a **three-branch environment-pinned flow**:

```
feature/* → dev → staging → main
```

- **`dev`** — active development, agent playground. Feature branches PR here. Josh may push directly.
- **`staging`** — integration / user QA. Auto-deploys to staging env on push. PR from `dev` only.
- **`main`** — stable release. Every commit is tagged. PR from `staging` only. Enforced by `promotion-check.yml` CI.

See `docs/dev/branch-strategy.md` for the full strategy.

**Rules:**

- Never push directly to `main` or `staging`. Always use a PR.
- Agent feature PRs target `dev` by default (`prBaseBranch: 'dev'` in `DEFAULT_GIT_WORKFLOW_SETTINGS`).
- **All promotion PRs use `--merge` (merge commit).** Squash breaks the DAG — the next promotion finds a synthetic commit as the new base and produces conflicts. Feature PRs to `dev` may squash (branch discarded). `dev→staging` and `staging→main` must always use `--merge`. See `docs/dev/branch-strategy.md` for full commands.
- Before committing, run `git status` and verify only intended files are staged. Watch for accidentally staged deletions from previously merged PRs.
- `.automaker/memory/` files are updated by agents during autonomous work. Include memory changes in your commits alongside related code changes — don't leave them as unstaged drift.

## Session Continuation

- When continuing a previous session or autonomous loop, always check MCP server connectivity and board status FIRST before attempting any agent launches or API calls.

## Project Overview

Automaker is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Brand Identity

The product is publicly branded as **protoLabs Studio** (domain: **protoLabs.studio**). The codebase uses "Automaker" internally (`@protolabs-ai/*` packages, `.automaker/` directory) — this is intentional and should NOT be renamed in code.

- **protoLabs** = the AI-native development agency (always camelCase)
- **protoMaker** = the AI development studio product
- **Automaker** = internal codename only, never in external-facing content

See `docs/protolabs/brand.md` for the full brand bible including voice, team, naming conventions, and content strategy.

## Important Guidelines

- **Dev Server Management**: NEVER start, stop, restart, or otherwise manage the dev server yourself. Always ask the user to manage it, or you will break it.
- **Document as you build**: When adding or changing a feature, update the relevant docs in `docs/`. New services get a page in the appropriate section. New config options get added to env var tables. API changes get reflected in the server reference. Follow the rules in `docs/dev/docs-standard.md` — every page must belong to a sidebar section, use `kebab-case.md` naming, and stay under 800 lines. If no appropriate section exists, add the page to the closest match rather than creating a new root-level file.
- **No emojis in docs or code**: Do not use emojis anywhere in documentation, markdown files, comments, or code. The only exceptions are ✅ and ❌ when used as status indicators in documentation tables or checklists.

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
├── site/             # Landing page (protolabs.studio) — static HTML on Cloudflare Pages
└── libs/             # Shared packages (@protolabs-ai/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    ├── spec-parser/       # XML/markdown spec parsing for project plans
    ├── pen-parser/        # PEN file parser for Penpot design files
    ├── git-utils/    # Git operations & worktree management
    ├── tools/        # Unified tool definition and registry system
    ├── flows/        # LangGraph state graph primitives & flow orchestration
    ├── llm-providers/# Multi-provider LLM abstraction layer
    ├── observability/# Langfuse tracing, prompt versioning & cost tracking
    └── ui/           # Shared UI components (@protolabs-ai/ui) — atoms, molecules, theme
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@protolabs-ai/types (no dependencies)
    ↓
@protolabs-ai/utils, @protolabs-ai/prompts, @protolabs-ai/platform, @protolabs-ai/model-resolver, @protolabs-ai/dependency-resolver, @protolabs-ai/spec-parser, @protolabs-ai/pen-parser, @protolabs-ai/tools, @protolabs-ai/flows, @protolabs-ai/llm-providers, @protolabs-ai/observability
    ↓
@protolabs-ai/git-utils, @protolabs-ai/ui
    ↓
@protolabs-ai/server, @protolabs-ai/ui (apps)
```

### Key Technologies

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **Testing**: Playwright (E2E), Vitest (unit)

### Server Architecture

The server (`apps/server/src/`) follows a modular pattern:

- `routes/` - Express route handlers organized by feature (agent, features, auto-mode, worktree, etc.)
- `services/` - Business logic (AgentService, AutoModeService, FeatureLoader, TerminalService, AuthorityService, PRFeedbackService, TrajectoryStoreService, FailureClassifierService)
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
├── trajectory/            # Verified execution trajectories (learning flywheel)
│   └── {featureId}/
│       └── attempt-{N}.json
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
import type { Feature, ExecuteOptions } from '@protolabs-ai/types';
import { createLogger, classifyError } from '@protolabs-ai/utils';
import { getEnhancementPrompt } from '@protolabs-ai/prompts';
import { getFeatureDir, ensureAutomakerDir } from '@protolabs-ai/platform';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { resolveDependencies } from '@protolabs-ai/dependency-resolver';
import { getGitRepositoryDiffs } from '@protolabs-ai/git-utils';

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

Project-specific rules are stored in `.automaker/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@protolabs-ai/utils`.

### Model Resolution

Use `resolveModelString()` from `@protolabs-ai/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5-20251001`
- `sonnet` → `claude-sonnet-4-6`
- `opus` → `claude-opus-4-6`

### Lead Engineer State Machine

The Lead Engineer service (`lead-engineer-service.ts`) is the production-phase nerve center. It manages per-feature lifecycle through a state machine, reacts to events with fast-path rules, and integrates with auto-mode for autonomous execution.

```
Signal (Linear webhook, GitHub event, MCP tool)
  --> SignalIntakeService.classifySignal() — ops vs gtm routing
  --> LeadEngineerService.process(feature)
    --> FeatureStateMachine: INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DONE
    --> Fast-path rules: pure functions, no LLM, event-driven
    --> Short-circuit: Any state → ESCALATE (on critical errors)
```

**Feature lifecycle states:**

| State    | Description                          | Transitions To              |
| -------- | ------------------------------------ | --------------------------- |
| INTAKE   | Feature created, awaiting processing | PLAN, ESCALATE              |
| PLAN     | Requirements analysis, spec gen      | EXECUTE, ESCALATE           |
| EXECUTE  | Implementation in worktree           | REVIEW, ESCALATE            |
| REVIEW   | PR created, under CI/CodeRabbit      | MERGE, EXECUTE (on failure) |
| MERGE    | PR approved, merging                 | DONE, ESCALATE              |
| DONE     | Feature fully deployed and verified  | (terminal)                  |
| ESCALATE | Blocked, needs intervention          | Any state (after fix)       |

**Integration with auto-mode:** When `LeadEngineerService` is available, auto-mode delegates to `leadEngineerService.process()` instead of `executeFeature()` directly. This adds state tracking, fast-path rules, and escalation handling on top of the existing agent execution pipeline.

**Types:** See `libs/types/src/lead-engineer.ts` for `FeatureState`, `LeadWorldState`, `LeadFastPathRule`, `LeadRuleAction`.

**API:** `GET /api/lead-engineer/status`, `POST /api/lead-engineer/{start,stop}`

### Feature Status System

Automaker uses a canonical **5-status system** for all features:

```
backlog → in_progress → review → done
             ↓           ↓
          blocked ← ← ← ┘
```

**Status Definitions:**

- `backlog` - Queued, ready to start (consolidates: pending, ready)
- `in_progress` - Being worked on (consolidates: running)
- `review` - PR created, under review
- `blocked` - Temporary halt (consolidates: failed)
- `done` - PR merged, work complete (consolidates: completed, waiting_approval, verified)

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
- `LANGFUSE_PUBLIC_KEY` - Langfuse public key (optional, enables observability)
- `LANGFUSE_SECRET_KEY` - Langfuse secret key (optional, enables observability)
- `LANGFUSE_BASE_URL` - Langfuse API URL (default: https://cloud.langfuse.com)
- `LANGFUSE_WEBHOOK_SECRET` - Webhook secret for verifying Langfuse webhook payloads
- `GITHUB_TOKEN` - GitHub personal access token for repository operations
- `GITHUB_REPO_OWNER` - GitHub repository owner/organization name
- `GITHUB_REPO_NAME` - GitHub repository name
- `LANGFUSE_SYNC_LABEL` - Prompt label to filter webhook events (default: production)
- `LANGFUSE_SYNC_CI_TRIGGER` - Enable repository_dispatch after prompt sync (true/1 to enable)
- `DISCORD_TOKEN` - Discord bot token for event routing and notifications
- `DISCORD_GUILD_ID` - Discord server (guild) ID
- `DISCORD_CHANNEL_SUGGESTIONS` - Channel ID for #suggestions
- `DISCORD_CHANNEL_PROJECT_PLANNING` - Channel ID for #project-planning
- `DISCORD_CHANNEL_AGENT_LOGS` - Channel ID for #agent-logs
- `DISCORD_CHANNEL_CODE_REVIEW` - Channel ID for #code-review
- `DISCORD_CHANNEL_INFRA` - Channel ID for #infra (health checks, Ava Gateway)

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

The MCP server exposes 135 tools organized by category:

**Feature Management:** `list_features`, `get_feature`, `create_feature`, `update_feature`, `delete_feature`, `move_feature`

**Agent Control:** `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent`

**Queue Management:** `queue_feature`, `list_queue`, `clear_queue`

**Context Files:** `list_context_files`, `get_context_file`, `create_context_file`, `delete_context_file`

**Project Spec:** `get_project_spec`, `update_project_spec`

**Orchestration:** `set_feature_dependencies`, `get_dependency_graph`, `start_auto_mode`, `stop_auto_mode`, `get_auto_mode_status`, `get_execution_order`

**Project Orchestration:** `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `create_project_features`

**Agent Templates:** `list_agent_templates`, `get_agent_template`, `register_agent_template`, `update_agent_template`, `unregister_agent_template`, `execute_dynamic_agent`, `get_role_registry_status`

**GitHub Operations:** `merge_pr`, `check_pr_status`, `resolve_review_threads`

**Observability:** `langfuse_list_traces`, `langfuse_get_trace`, `langfuse_get_costs`, `langfuse_list_prompts`, `langfuse_score_trace`, `langfuse_add_to_dataset`

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
import type { Project, Milestone, Phase, SPARCPrd } from '@protolabs-ai/types';

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
