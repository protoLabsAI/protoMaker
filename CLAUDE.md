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
- **Plan completion verification**: Before committing a multi-step plan implementation, run the verification checklist in `.automaker/context/plan-completion-verification.md`. CI catches broken code but NOT unwired code — a service with passing tests can be completely disconnected from the runtime. Every new file must have a non-test importer. Every new service must have an integration test covering its wiring point.

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

## Release Workflow

Releases follow a two-step CI workflow. Version bumps happen on staging BEFORE promotion to main.

### Step 1: Prepare Release (bump version on staging)

Trigger the `prepare-release.yml` workflow on staging. This bumps `version` in all `package.json` files across the monorepo (root, apps, libs), commits, and optionally syncs the bump to dev.

```bash
# Trigger version bump (auto-detects next minor from git tags)
gh workflow run prepare-release.yml --ref staging

# Or dry run first
gh workflow run prepare-release.yml --ref staging -f dry_run=true
```

Wait for the workflow to complete before proceeding.

### Step 2: Promote staging to main

Create a merge-commit PR from staging to main. The PR title should include the version.

```bash
gh pr create --base main --head staging --title "Promote staging to main (vX.Y.Z)"
gh pr merge <number> --merge --auto
```

### Step 3: Auto Release (automatic)

When the staging→main PR merges, `auto-release.yml` fires automatically. It reads the version from `package.json`, creates a git tag (`vX.Y.Z`), and publishes a GitHub Release.

If the tag already exists, the workflow skips with `WARNING: vX.Y.Z is already tagged. Skipping.` — this means Step 1 was missed or the version wasn't bumped.

### Common Mistake

Promoting staging→main WITHOUT running prepare-release first. The auto-release sees the existing tag and does nothing. Always bump version on staging first.

## Session Continuation

- When continuing a previous session or autonomous loop, always check MCP server connectivity and board status FIRST before attempting any agent launches or API calls.

## Blocked Feature Recovery

When a feature blocks, check `statusChangeReason` immediately. Common patterns and fixes:

**"uncommitted work in worktree" / commit failed:**
The agent completed its work but the git workflow ran `git commit` without staging first. New files show as `??` (untracked) and modified files as ` M` in `git status`.

Recovery:

```bash
git -C /path/to/.worktrees/<branch> add -A
git -C /path/to/.worktrees/<branch> commit --no-verify -m "<feat/fix/refactor>: <title>"
```

Then use `create_pr_from_worktree` targeting `dev`, move feature to `review`, enable auto-merge on the PR.

**Prettier check fails in CI (worktree path masking):**
Fixed at the source — `worktree-recovery-service.ts` and `git-workflow-service.ts` now use `node "${projectPath}/node_modules/.bin/prettier" --ignore-path /dev/null` instead of `npx prettier`. If you still hit this manually, use: `npx prettier --write <file> --ignore-path /dev/null`.

**"has existing context, resuming" → agent exits immediately (stale context trap):**
Server logs show: `Feature <id> has existing context, resuming instead of starting fresh` followed immediately by `Feature <id> execution ended, cleaning up runningFeatures`. The previous run left an `agent-output.md` in `.automaker/features/<id>/`. The server tries to resume the dead Claude session, handshake fails silently, agent exits.

Recovery — rename stale files BEFORE retrying `start_agent`:

```bash
mv .automaker/features/<id>/agent-output.md .automaker/features/<id>/agent-output.md.stale
# Also clear any handoff files from the previous session:
mv .automaker/features/<id>/handoff-EXECUTE.json .automaker/features/<id>/handoff-EXECUTE.json.stale 2>/dev/null || true
```

Then reset `failureCount: 0` in `feature.json` and call `start_agent`. Resetting feature `status` alone is NOT enough — the stale output file is what triggers the resume path.

**Self-improvement rule:** When you observe a recurring failure pattern that blocks agents, you MUST immediately:

1. File a P1 bug feature on the board describing the root cause and fix
2. Add the pattern to `ops-lessons.md` in memory
3. Add recovery steps here in CLAUDE.md

Do not just recover and move on. The flywheel only improves if failures are captured.

## Project Overview

protoLabs Studio is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees. The repo name `protoMaker` on GitHub preserves lineage to the original Automaker project. Internal package names (`@protolabsai/*`), directory paths (`.automaker/`), and the codename "Automaker" are preserved in code and config.

## Brand Identity

The product is publicly branded as **protoLabs.studio** (domain: **protoLabs.studio**). The codebase uses "Automaker" internally (`@protolabsai/*` packages, `.automaker/` directory) — this is intentional and should NOT be renamed in code.

- **protoLabs** / **protoLabs Studio** = the AI-native development agency and product (always camelCase)
- **protoMaker** = GitHub repo name only, preserves lineage — not a product name
- **Automaker** = internal codename for board engine and auto-mode — never in docs, UI, or external content

See `docs/protolabs/brand.md` for the full brand bible including voice, team, naming conventions, and content strategy.

## Documentation Design

Documentation follows the [Diataxis framework](https://diataxis.fr/) — four content types, each serving a distinct user need. Never mix types on a single page.

| Type             | User Goal          | Where It Lives                           | Key Rule                                           |
| ---------------- | ------------------ | ---------------------------------------- | -------------------------------------------------- |
| **Tutorial**     | Learn by doing     | `getting-started/`                       | Linear, guided, guaranteed success. No choices.    |
| **How-to Guide** | Accomplish a task  | `agents/`, `integrations/`, `protolabs/` | Steps only. Assumes knowledge. No explanation.     |
| **Reference**    | Look something up  | `server/`, env var tables, API docs      | Complete, accurate, terse. Organized for scanning. |
| **Explanation**  | Understand the why | `authority/`, `dev/`                     | Conceptual, narrative. No instructions.            |

**If a page tries to be two types at once, it fails at both.** A tutorial that stops to explain architecture loses the learner. A reference page with tutorial narrative wastes the expert's time. Split mixed pages.

### Content Principles

1. **Code before prose.** Show the snippet first, explain it second. Developers pattern-match on code faster than they read paragraphs.
2. **Outcome-focused headings.** "Accept a payment" not "PaymentIntent API". Lead with what the user accomplishes, not what the component is named.
3. **One idea per sentence.** Short sentences. Active verbs. Second person ("you").
4. **Every page opens with orientation.** One paragraph: what this page covers, who it's for, what they'll have after reading it.
5. **Progressive disclosure.** Show the simplest case first. Advanced options, edge cases, and configuration come after.
6. **Realistic examples.** Use plausible variable names and data shapes. `featureId: "auth-login-flow"` not `id: "abc"`.
7. **No marketing language.** Any sentence that could appear in a sales deck does not belong in technical documentation.

### Page Template

Every documentation page follows this structure:

```markdown
# [Outcome-Focused Title]

[One paragraph: what this covers, who it's for, what you'll have after reading]

## Prerequisites (only if non-trivial)

## [Verb-phrase section heading: "Configure X", "Set up Y"]

[Code first, then explanation]

## Next steps (optional)

- **[Related Page](./related)** — Why they should read it next
```

### Key Metric: Time to First Hello World (TTFHW)

The single most important documentation metric. Measures: time from a new user's first contact with docs to their first successful result (agent running, feature created, etc.). Every quickstart decision should minimize this number. Target: under 5 minutes.

### Three Documentation Surfaces

1. **External VitePress site** (`docs/`) — Public-facing product documentation. Deployed statically. See `docs/dev/docs-standard.md` for the full standard (naming, IA, maintenance procedures, VitePress config).
2. **Internal project docs** (`docs/internal/`) — Internal development documentation for the automaker team. Architecture decisions, operational runbooks, internal APIs, team processes. NOT included in the public VitePress build. Written for contributors and operators, not end users.
3. **In-app docs viewer** — Per-project markdown viewer/editor at the configured `docsPath`. Reads `.md` files from the project directory. Used for project-specific documentation that lives alongside the code.

### Documentation Surfaces Are Not the Same

| Surface       | Audience                                 | Location               | Content Type                                 |
| ------------- | ---------------------------------------- | ---------------------- | -------------------------------------------- |
| Public docs   | End users, developers adopting protoLabs | `docs/` (VitePress)    | Tutorials, how-to guides, API reference      |
| Internal docs | Automaker team, contributors, operators  | `docs/internal/`       | Architecture, runbooks, decisions, processes |
| In-app viewer | Users of any project                     | Per-project `docsPath` | Project-specific docs alongside code         |

Don't conflate them. A page about "how to deploy to staging" is internal. A page about "how to set up auto-mode" is public.

## Important Guidelines

- **Dev Server Management**: NEVER start, stop, restart, or otherwise manage the dev server yourself. Always ask the user to manage it, or you will break it.
- **Document as you build**: When adding or changing a feature, update the relevant docs in `docs/`. New services get a page in the appropriate section. New config options get added to env var tables. API changes get reflected in the server reference. Follow the rules in `docs/dev/docs-standard.md` — every page must belong to a sidebar section, use `kebab-case.md` naming, and stay under 800 lines. If no appropriate section exists, add the page to the closest match rather than creating a new root-level file.
- **No emojis in docs or code**: Do not use emojis anywhere in documentation, markdown files, comments, or code. The only exceptions are ✅ and ❌ when used as status indicators in documentation tables or checklists.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:full            # Web mode — starts UI (:3007) AND server (:3008) together
npm run dev:web             # UI only (localhost:3007) — requires server running separately on :3008
npm run dev:server          # Backend server only (localhost:3008)
npm run dev:electron        # Desktop app mode (bundles server automatically)
npm run dev:electron:debug  # Desktop with DevTools open
npm run dev:headless        # Production-mode server locally (builds packages + server first)

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
npm run build:electron      # Build desktop app for current platform
npm run build:electron:legless      # Legless Electron build (no bundled server)
npm run build:electron:legless:dir  # Legless Electron unpacked directory (for testing)
npm run build:server        # Build server only

# Preview / Local Production Testing
npm run preview:web         # Build web app + serve via vite preview (localhost:4173, includes PWA)

# Testing
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # All shared package tests
npm run test:all            # All tests (packages + server)

# Single test file
npm run test:server -- tests/unit/specific.test.ts

# Type checking
npm run typecheck           # Full typecheck (UI + server)

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
└── libs/             # Shared packages (@protolabsai/*)
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
    ├── observability/# Langfuse tracing & cost tracking
    └── ui/           # Shared UI components (@protolabsai/ui) — atoms, molecules, theme
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@protolabsai/types (no dependencies)
    ↓
@protolabsai/utils, @protolabsai/prompts, @protolabsai/platform, @protolabsai/model-resolver, @protolabsai/dependency-resolver, @protolabsai/spec-parser, @protolabsai/pen-parser, @protolabsai/tools, @protolabsai/flows, @protolabsai/observability
    ↓
@protolabsai/git-utils, @protolabsai/ui
    ↓
@protolabsai/server, @protolabsai/ui (apps)
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

### Multi-Agent Architecture

Automaker uses CLI skills and the native Claude Code Agent tool for agent spawning. Agent roles are defined as CLI command files in `.claude/commands/` with system prompts, tool restrictions, and model selection. Feature execution agents run in isolated git worktrees via the Lead Engineer pipeline.

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
import type { Feature, ExecuteOptions } from '@protolabsai/types';
import { createLogger, classifyError } from '@protolabsai/utils';
import { getEnhancementPrompt } from '@protolabsai/prompts';
import { getFeatureDir, ensureAutomakerDir } from '@protolabsai/platform';
import { resolveModelString } from '@protolabsai/model-resolver';
import { resolveDependencies } from '@protolabsai/dependency-resolver';
import { getGitRepositoryDiffs } from '@protolabsai/git-utils';

// ❌ Never import from old paths
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

## Key Patterns

### Feature Flag Checklist

Feature flags are boolean toggles that gate in-development functionality per installation. The single source of truth is `DEFAULT_FEATURE_FLAGS` in `libs/types/src/global-settings.ts`. See `docs/dev/feature-flags.md` for full detail.

**`FeatureFlags` vs `WorkflowSettings`**: `FeatureFlags` are global per-install product on/off toggles stored in `data/settings.json`. `WorkflowSettings` are per-project pipeline tuning parameters (model tier, retry counts) stored in `.automaker/settings.json`. Do not conflate them.

When adding a new feature flag, follow these 5 steps in order:

1. Add the field to `FeatureFlags` interface in `libs/types/src/global-settings.ts` and set its default to `false` in `DEFAULT_FEATURE_FLAGS`.
2. TypeScript will immediately error in `developer-section.tsx` — add a label and description entry to `FEATURE_FLAG_LABELS` there. The `Record<keyof FeatureFlags, ...>` type makes this a compile-time requirement.
3. Do NOT add hardcoded defaults elsewhere. `DEFAULT_FEATURE_FLAGS` is the only source. The spread pattern in `use-settings-sync.ts` automatically propagates new flags to existing installs.
4. Add a server-side guard wherever the feature has side effects: `const enabled = featureFlags?.yourFlag ?? false` via `settingsService.getGlobalSettings()`. Always treat `settingsService` as optional — default to `false` when absent.
5. Add unit tests covering behavior when the flag is `false` (default) and when `true`.

### Event-Driven Architecture

All server operations emit events that stream to the frontend via WebSocket. Events are created using `createEventEmitter()` from `lib/events.ts`.

### Git Worktree Isolation

Each feature executes in an isolated git worktree, protecting the main branch during AI agent execution. Worktrees are **auto-created** when an agent starts if one doesn't exist for the feature's branch. Worktrees are stored in `{projectPath}/.worktrees/{branch-name}`.

### Context Files

Project-specific rules are stored in `.automaker/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@protolabsai/utils`.

### Model Resolution

Use `resolveModelString()` from `@protolabsai/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5-20251001`
- `sonnet` → `claude-sonnet-4-6`
- `opus` → `claude-opus-4-6`

### Lead Engineer State Machine

The Lead Engineer service (`lead-engineer-service.ts`) is the production-phase nerve center. It manages per-feature lifecycle through a state machine, reacts to events with fast-path rules, and integrates with auto-mode for autonomous execution.

```
Signal (Discord event, GitHub event, MCP tool)
  --> SignalIntakeService.classifySignal() — ops vs gtm routing
  --> LeadEngineerService.process(feature)
    --> FeatureStateMachine: INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE
    --> Fast-path rules: pure functions, no LLM, event-driven
    --> Short-circuit: Any state → ESCALATE (on critical errors)
```

**Feature lifecycle states:**

| State    | Description                          | Transitions To              |
| -------- | ------------------------------------ | --------------------------- |
| INTAKE   | Feature created, awaiting processing | PLAN, EXECUTE, ESCALATE     |
| PLAN     | Requirements analysis, spec gen      | EXECUTE, ESCALATE           |
| EXECUTE  | Implementation in worktree           | REVIEW, ESCALATE            |
| REVIEW   | PR created, under CI/CodeRabbit      | MERGE, EXECUTE (on failure) |
| MERGE    | PR approved, merging                 | DEPLOY, ESCALATE            |
| DEPLOY   | Post-merge verification, reflection  | DONE                        |
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
mcp__protolabs__create_feature({
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
- `DISCORD_TOKEN` - Discord bot token for event routing and notifications
- `DISCORD_GUILD_ID` - Discord server (guild) ID
- `DISCORD_CHANNEL_SUGGESTIONS` - Channel ID for #suggestions
- `DISCORD_CHANNEL_PROJECT_PLANNING` - Channel ID for #project-planning
- `DISCORD_CHANNEL_AGENT_LOGS` - Channel ID for #agent-logs
- `DISCORD_CHANNEL_CODE_REVIEW` - Channel ID for #code-review
- `DISCORD_CHANNEL_INFRA` - Channel ID for #infra (health checks, Ava Gateway)

### Known Discord Channel IDs

Guild ID: `1070606339363049492`

| Channel        | ID                    | Purpose                                           |
| -------------- | --------------------- | ------------------------------------------------- |
| `#ava`         | `1469195643590541353` | Primary Ava communication                         |
| `#infra`       | `1469109809939742814` | Infrastructure alerts and changes                 |
| `#dev`         | `1469080556720623699` | Code and feature updates                          |
| `#bug-reports` | `1477837770704814162` | Bug triage channel (channel workflow: bug_triage) |
| `#vip-lounge`  | `1473561265690382418` | VIP / alpha tester lounge                         |
| `#deployments` | `1469049508909289752` | Deployment notifications                          |
| `#alerts`      | `1469109811915522301` | System alerts                                     |

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
claude plugin install protolabs
```

### Available MCP Tools

The MCP server exposes ~159 tools organized by category:

**Feature Management:** `list_features`, `get_feature`, `create_feature`, `update_feature`, `delete_feature`, `move_feature`

**Agent Control:** `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent`

**Queue Management:** `queue_feature`, `list_queue`, `clear_queue`

**Context Files:** `list_context_files`, `get_context_file`, `create_context_file`, `delete_context_file`

**Project Spec:** `get_project_spec`, `update_project_spec`

**Orchestration:** `set_feature_dependencies`, `get_dependency_graph`, `start_auto_mode`, `stop_auto_mode`, `get_auto_mode_status`, `get_execution_order`

**Project Orchestration:** `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `create_project_features`

**Agent Templates:** Removed — agent spawning is handled by Claude Code's native Agent tool.

**GitHub Operations:** `merge_pr`, `check_pr_status`, `resolve_pr_threads`

**Observability:** `langfuse_list_traces`, `langfuse_get_trace`, `langfuse_get_costs`, `langfuse_score_trace`, `langfuse_list_datasets`, `langfuse_add_to_dataset`

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
import type { Project, Milestone, Phase, SPARCPrd } from '@protolabsai/types';

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
epic/foundation ──────────── Epic PR (targets dev)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

**Automatic Behavior:**

- Feature PRs automatically target their epic's branch (not dev)
- Epic PRs target dev (never main directly)
- Features without an epic target dev directly
- When the last child feature's PR merges to the epic branch, `CompletionDetectorService` automatically creates the epic-to-dev PR with `--merge` auto-merge enabled
- When the epic-to-dev PR merges (detected by GitHub webhook), the epic is marked `done` and the epic branch is deleted
- If the epic-to-dev PR has conflicts, the epic is marked `blocked` with a reason explaining manual intervention is needed

**Epic Lifecycle:**

```
children in_progress → children done → epic PR created (review) → epic PR merges → epic done
```

**Merge Order:**

1. Merge all feature PRs into the epic branch (squash OK)
2. Epic-to-dev PR is auto-created and auto-merged with `--merge` strategy (never squash)

This keeps dev clean while allowing incremental feature development within epics.

### Creating a Project via MCP

```typescript
// Create project plan
mcp__protolabs__create_project({
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
mcp__protolabs__create_project_features({
  projectPath: '/path/to/project',
  projectSlug: 'my-feature',
  createEpics: true,
  setupDependencies: true,
});
```
