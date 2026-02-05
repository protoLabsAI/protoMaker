# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automaker is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Important Guidelines

- **Dev Server Management**: NEVER start, stop, restart, or otherwise manage the dev server yourself. Always ask the user to manage it, or you will break it.

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
    └── git-utils/    # Git operations & worktree management
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@automaker/types (no dependencies)
    ↓
@automaker/utils, @automaker/prompts, @automaker/platform, @automaker/model-resolver, @automaker/dependency-resolver
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
- `services/` - Business logic (AgentService, AutoModeService, FeatureLoader, TerminalService)
- `providers/` - AI provider abstraction (currently Claude via Claude Agent SDK)
- `lib/` - Utilities (events, auth, worktree metadata)

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

- `haiku` → `claude-haiku-4-5`
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-5-20251101`

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
# 1. Ensure AUTOMAKER_API_KEY is set in .env
echo "AUTOMAKER_API_KEY=automaker-dev-key-2026" >> .env

# 2. Build the MCP server
npm run build:packages

# 3. Add the plugin marketplace and install
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
claude plugin install automaker
```

### Available MCP Tools

The MCP server exposes 32 tools organized by category:

**Feature Management:** `list_features`, `get_feature`, `create_feature`, `update_feature`, `delete_feature`, `move_feature`

**Agent Control:** `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent`

**Queue Management:** `queue_feature`, `list_queue`, `clear_queue`

**Context Files:** `list_context_files`, `get_context_file`, `create_context_file`, `delete_context_file`

**Project Spec:** `get_project_spec`, `update_project_spec`

**Orchestration:** `set_feature_dependencies`, `get_dependency_graph`, `start_auto_mode`, `stop_auto_mode`, `get_auto_mode_status`, `get_execution_order`

**Project Orchestration:** `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `create_project_features`

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
