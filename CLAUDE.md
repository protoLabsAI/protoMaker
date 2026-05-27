# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prime Directive: File Follow-Ups Immediately

**If something is worth following, file it — in the same turn you noticed it. Don't leave it in the conversation.**

Conversations get compacted at the context limit. Issues, board features, CLAUDE.md entries, and memory files survive. Anything that lives only in chat will eventually be lost.

When you say "worth filing later," "we should track this," "follow-up needed," or notice a bug / missing feature / recurring pattern — open the tool call to file it right then. Acceptable durable surfaces, in priority order:

1. **GitHub issue** — for bugs, missing features, follow-ups that need work later
2. **Board feature** (via `/api/features/create` or `mcp__protolabs__create_feature`) — for things the crew can pick up now
3. **CLAUDE.md update** — for durable rules, recovery procedures, project conventions
4. **`.automaker/memory/ops-lessons.md`** — for recurring failure patterns and their fixes

Default to GitHub issue if unsure. Include enough context that a fresh session can act without reading the original conversation: symptom, evidence (file paths, PR numbers, commit SHAs), recommended fix, acceptance. Stub issues are fine — one paragraph beats no record.

This is a stronger form of the existing self-improvement rule under "Blocked Feature Recovery" (which is about recurring failures specifically). This rule is broader: **any** follow-up at all, not just recurring failures.

## Philosophy: Greenfield-First

This is a greenfield codebase. We are building the future, not maintaining the past.

- **No backward compatibility.** When changing an interface, update ALL consumers immediately. Never add compat shims, deprecated aliases, re-exports, or `// legacy` comments. Old code dies the moment new code lands.
- **No mockups or stubs.** Build the real thing or don't build it. No placeholder implementations, fake data, or TODO-driven development.
- **No deprecation cycles.** If something is wrong, replace it. Don't mark it deprecated and hope someone cleans it up later.
- **No shortcuts.** Do it right the first time. If that means touching 10 files to propagate a type change, touch 10 files.
- **Do things correctly or not at all.** Every line of code should be production-quality from day one.

## Philosophy: Platform-First Architecture

protoLabs Studio is a **platform for building apps**, not just our internal tool. Every architectural decision must account for the fact that other teams will use this to build their own projects with their own workflows, CI providers, branch strategies, and hosting setups.

- **Never hardcode workflow-specific values.** File paths, branch names, CI check names, channel IDs, and hosting providers must come from settings or configuration — never from string literals in business logic. If you're typing a specific value that only applies to our setup, it belongs in a config file, not in code.
- **Be opinionated with defaults, flexible with overrides.** Ship sensible defaults (e.g., `prBaseBranch: "main"`, `prMergeStrategy: "squash"`) but always expose them as configurable settings. The default experience should "just work" but never lock users into our conventions.
- **Settings are the contract with users.** When adding new behavior, ask: "Would a team using a different CI provider / branch strategy / hosting setup need to change this?" If yes, make it a setting. Refer to `DEFAULT_GIT_WORKFLOW_SETTINGS` and `DEFAULT_FEATURE_FLAGS` as canonical examples.
- **Validate at boundaries, trust internally.** Check user-provided config at load time, then pass validated values through the system. Don't scatter defensive checks for "what if this setting is missing" deep in business logic.
- **New features must work for any project.** Before implementing, verify the solution doesn't assume our repo structure, our GitHub org, our CI checks, or our Discord server. If it does, parameterize it.

## Planning & Approach

- When creating plans, start with the minimal viable scope. Prefer single-phase plans unless explicitly asked for more. Default to the smallest, lowest-risk approach first.
- Stay in plan mode until the user explicitly confirms the plan is complete and approved. Wait for user signal before proceeding to implementation.
- **Plan completion verification**: Before committing a multi-step plan implementation, verify wiring is complete. CI catches broken code but NOT unwired code — a service with passing tests can be completely disconnected from the runtime. Every new file must have a non-test importer. Every new service must have an integration test covering its wiring point.

## Git Workflow

This repo uses a **single integration branch flow**:

```
feature/* → main
```

- **`main`** — the only long-lived branch. Feature branches PR here. Releases fire automatically on merge to main.

**Rules:**

- Never push directly to `main`. Always use a PR.
- Agent feature PRs target `main` by default (`prBaseBranch: 'main'` in `DEFAULT_GIT_WORKFLOW_SETTINGS`).
- Epic PRs use `--merge` (merge commit) to preserve the DAG; feature PRs to `main` may squash. See `libs/types/src/git-settings.ts`.
- Before committing, run `git status` and verify only intended files are staged. Watch for accidentally staged deletions from previously merged PRs.
- **Never force-push the base branch HEAD onto PR feature branches.** This overwrites the agent's code changes (branch becomes identical to base = zero diff) and GitHub auto-closes the PR. Some PRs cannot be reopened after this. To update a PR branch with changes from main, use `gh pr update-branch <number>` (merge strategy) or let auto-mode handle rebasing.
- `.automaker/memory/` files are updated by agents during autonomous work. Include memory changes in your commits alongside related code changes — don't leave them as unstaged drift.

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

Then use `create_pr_from_worktree` targeting `main`, move feature to `review`, enable auto-merge on the PR.

**Prettier check fails in CI (worktree path masking):**
Fixed at the source — `worktree-recovery-service.ts` and `git-workflow-service.ts` now use `node "${projectPath}/node_modules/.bin/prettier" --ignore-path /dev/null` instead of `npx prettier`. If you still hit this manually, use: `npx prettier --write <file> --ignore-path /dev/null`.

**Prettier check fails in CI (pre-existing formatting violations — passes locally but fails CI):**
Symptom: `npm run format:check` returns `Code style issues found in N files` on specific files, but running the same command locally reports `All matched files use Prettier code style!`. Same version, same config, same SHA.

Root cause: CI always runs a fresh `npm install` (exact version pins), while local `pnpm` may use a cached/prior prettier install or a globally installed prettier of a slightly different version. Files that were formatted by an older prettier and never re-checked can silently drift. CI catches this; local won't unless you explicitly re-run prettier write.

Common violations found: multi-line `import { x, }` that should be inline when the name fits under `printWidth: 100`; inline object property values (`description: 'long...'`) that exceed 100 chars and should be on a new line; escaped single-quotes (`\'`) that should use outer double-quotes.

Recovery:

```bash
# On the host machine (not in a worktree sandbox):
./node_modules/.bin/prettier --write <file1> <file2> ...
# Or from any environment with node:
node /path/to/project/node_modules/.bin/prettier --ignore-path /dev/null --write <files>
```

Prevention: After any merge or back-merge, run `npm run format:check` before opening a PR. This check runs first in the `checks` CI workflow and blocks merging.

**Feature blocked with "merge_conflict" / "unmerged files" (stuck MERGE_HEAD):**
A previous `git merge` failed with conflicts and left `.git/MERGE_HEAD` in the worktree. Every subsequent merge or stash attempt immediately fails with "Merging is not possible because you have unmerged files", creating an unrecoverable loop. The system now auto-clears this via `ensureCleanMergeState()` before each merge attempt (`libs/git-utils/src/rebase.ts`). If a feature is still stuck:

Recovery — clear the stuck merge state manually:

```bash
git -C /path/to/.worktrees/<branch> merge --abort
# If --abort fails:
git -C /path/to/.worktrees/<branch> reset --merge
```

Then reset `failureCount: 0` in `feature.json`, reset `status` to `backlog`, and call `start_agent`. The next run will call `ensureCleanMergeState()` automatically before the pre-flight merge.

**Root cause:** Pre-flight merge (`git merge origin/<prBaseBranch>`) was attempted on a worktree with a prior incomplete merge, leaving `MERGE_HEAD` present. Fixed by always calling `ensureCleanMergeState()` before any merge or stash operation.

**"has existing context, resuming" → agent exits immediately (stale context trap):**
Server logs show: `Feature <id> has existing context, resuming instead of starting fresh` followed immediately by `Feature <id> execution ended, cleaning up runningFeatures`. The previous run left an `agent-output.md` in `.automaker/features/<id>/`. The server tries to resume the dead Claude session, handshake fails silently, agent exits.

Recovery — rename stale files BEFORE retrying `start_agent`:

```bash
mv .automaker/features/<id>/agent-output.md .automaker/features/<id>/agent-output.md.stale
# Also clear any handoff files from the previous session:
mv .automaker/features/<id>/handoff-EXECUTE.json .automaker/features/<id>/handoff-EXECUTE.json.stale 2>/dev/null || true
```

Then reset `failureCount: 0` in `feature.json` and call `start_agent`. Resetting feature `status` alone is NOT enough — the stale output file is what triggers the resume path.

**Wrong branch prefix (feature/ instead of fix/):**
Agent-created fix/bug branches used `feature/` prefix instead of `fix/`. Root cause (fixed in PR #3346): `generateBranchName()` hardcoded `"feature/"` regardless of the feature's `category`.

Recovery — when a feature has a wrong-prefix branch:

```bash
# Create correctly-prefixed replacement branch targeting main
git checkout main && git pull origin main
git checkout -b fix/<slug>
git cherry-pick <bad-branch-sha>
git push origin fix/<slug>
gh pr create --base main --title "fix(ci): <title>"
# Close the bad PR
gh pr close <old-number> --comment "Replaced by #<new-number> with correct fix/ prefix"
```

Prevention: Always set `category: 'fix'` (or `'bug'`) when creating fix features via MCP — `branchPrefixForCategory()` will automatically use `fix/`. See `.automaker/memory/ops-lessons.md` for the full pattern.

**Stale ESCALATE checkpoint traps next dispatch (~40ms to blocked):**
Symptom: `start_agent` / `run-feature` returns success, but the feature flips to `blocked` in well under a second with `statusChangeReason: "Max agent retries exceeded: 3 attempts, limit 3"` even after you reset `failureCount: 0`. Server log shows `Checkpoint loaded for <id> at state ESCALATE` → immediate ESCALATE → no execution attempted. `failureCount` may even be 1 (not 3) on the feature, but the checkpoint has stale `retryCount: 3` in its context.

Root cause: `LeadEngineerStateMachine.processFeatureGraph()` enqueues a post-transition save of the ESCALATE checkpoint via the non-awaited `persistQueue`, then awaits `checkpointService.delete()`. The delete can run before the queued save, leaving a stale ESCALATE checkpoint on disk. Filed as P1 bug — `apps/server/src/services/lead-engineer-state-machine.ts` around lines 465 (save) and 583 (delete).

Recovery — dispatch a second time:

```bash
# 1) Reset feature
python3 -c "
import json
p = '.automaker/features/<featureId>/feature.json'
d = json.load(open(p))
d['failureCount'] = 0; d['status'] = 'backlog'; d['statusChangeReason'] = None
json.dump(d, open(p, 'w'), indent=2)
"
# 2) Dispatch — this run reaches ESCALATE again and deletes the stale checkpoint as terminal cleanup
curl -sS -X POST http://localhost:3008/api/auto-mode/run-feature \
  -H "Content-Type: application/json" -H "x-api-key: $AUTOMAKER_API_KEY" \
  -d '{"projectPath":"<absPath>","featureId":"<featureId>","useWorktrees":true}'
# 3) Reset feature again, dispatch again — this run starts clean from INTAKE
```

Alternative: delete the file directly if you can find it (it lives at `<projectPath>/.automaker/checkpoints/<featureId>.json`). It may have already been deleted by the most recent ESCALATE run — if so, only one fresh dispatch is needed.

**Self-improvement rule:** When you observe a recurring failure pattern that blocks agents, you MUST immediately:

1. File a P1 bug feature on the board describing the root cause and fix
2. Add the pattern to `ops-lessons.md` in memory
3. Add recovery steps here in CLAUDE.md

Do not just recover and move on. The flywheel only improves if failures are captured.

## Naming Convention: Instance / App / Project / Feature

Four terms with precise meanings. Confusing them causes cross-app contamination bugs. See `docs/internal/portfolio-philosophy.md` for the full glossary.

| Term         | Identifier     | Scope        | Isolation                                                 |
| ------------ | -------------- | ------------ | --------------------------------------------------------- |
| **Instance** | Server process | Global       | Blind to other instances                                  |
| **App**      | `projectPath`  | Per-instance | Filesystem-enforced (`{projectPath}/.automaker/`)         |
| **Project**  | `projectSlug`  | Per-app      | Tag-based filter, NOT a filesystem boundary               |
| **Feature**  | `featureId`    | Per-app      | Lives in `{projectPath}/.automaker/features/{featureId}/` |

- Auto-mode, concurrency, review queues, and worktrees are all scoped per-app (`projectPath`).
- `projectSlug` groups features within an app for planning and filtering — it does not create isolation.
- Cross-instance coordination is the user's responsibility. Instances do not communicate.

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

### Two Documentation Surfaces

1. **External VitePress site** (`docs/`) — Public-facing product documentation. Deployed statically. See `docs/dev/docs-standard.md` for the full standard (naming, IA, maintenance procedures, VitePress config).
2. **Internal docs via in-app viewer** (`docs/internal/`) — Internal development documentation for the automaker team, viewed and edited through the in-app docs viewer. Architecture decisions, operational runbooks, internal APIs, team processes. NOT included in the public VitePress build. The in-app docs viewer's `docsPath` setting points here (`docs/internal`), making internal docs browsable and editable directly within protoLabs Studio.

### Documentation Surfaces Are Not the Same

| Surface       | Audience                                 | Location            | Content Type                                 |
| ------------- | ---------------------------------------- | ------------------- | -------------------------------------------- |
| Public docs   | End users, developers adopting protoLabs | `docs/` (VitePress) | Tutorials, how-to guides, API reference      |
| Internal docs | Automaker team, contributors, operators  | `docs/internal/`    | Architecture, runbooks, decisions, processes |

The in-app docs viewer is the interface for internal docs. A page about "how to deploy to staging" is internal. A page about "how to set up auto-mode" is public.

## Local Issue Tracker: `br` (beads)

This repo uses **[beads_rust](https://github.com/Dicklesworthstone/beads_rust)** (`br`) as its local-first issue tracker. It is the canonical TODO/issue surface — both for humans and for agents. The in-app "TODO view" is a thin CRUD wrapper over the same `.beads/` store.

- **Binary**: `br` (installed at `~/.cargo/bin/br`, version 0.1.23+). Verify with `br --version`.
- **State per project**: `.beads/beads.db` (SQLite, authoritative) + `.beads/issues.jsonl` (git-friendly export, auto-flushed on every mutation).
- **One tracker per repo.** No multi-list concept — filter by `--type`, `--status`, `--priority`, or `--assignee` instead.

### Common commands (agent use)

Always pass `--json` and run with `RUST_LOG=error` to suppress dependency log spam:

```bash
RUST_LOG=error br list --json                                    # All issues
RUST_LOG=error br ready --json                                   # Issues not blocked by deps
RUST_LOG=error br show br-abc123 --json                          # Single issue
RUST_LOG=error br create "Title" --type feature --priority 1 --json
RUST_LOG=error br update br-abc123 --status in_progress --json
RUST_LOG=error br close br-abc123 --reason "Done" --json
RUST_LOG=error br dep add br-abc123 br-def456                    # abc depends on def
```

Types: `feature | task | bug | chore | epic`. Priority: `0` (critical) → `4` (backlog). Status: `open | in_progress | blocked | closed`.

### Working with `.beads/` in this repo

- `.beads/issues.jsonl` is checked in and merges cleanly in git — commit it alongside the code changes it tracks.
- `.beads/beads.db` should be **gitignored** (SQLite binary, rebuildable from the JSONL via `br sync --import-only --rebuild`).
- `br` is non-invasive: it never auto-commits, pushes, pulls, or installs hooks. Git handoff is the user's / agent's responsibility.
- After agent work that mutated issues: `git add .beads/issues.jsonl && git commit -m "..."`.

### Server integration

Server-side issue CRUD goes through `BeadsService` (`apps/server/src/services/beads-service.ts`), which subprocesses `br --json` with `cwd: projectPath`. Routes mounted at `/api/beads/*`. Do not bypass — never read `.beads/beads.db` directly from app code; always go through `br` so concurrency and JSONL auto-flush stay consistent.

## Important Guidelines

- **Dev Server Management**: Do not start, stop, restart, or otherwise manage the dev server yourself. Always ask the user to manage it, or you will break it.
- **Investigate before answering**: Never speculate about code you have not read. Before making claims about what a file contains, what a function does, or what an import path resolves to, read the file first. Before suggesting a fix, verify the current state of the code. This applies to all interactions — chat, implementation, and review.
- **Admit uncertainty**: If you are unsure about how something works in this codebase, say so and investigate rather than guessing. "I'm not sure — let me check" is always better than a confident but wrong answer.
- **Use only verified APIs**: Do not rely on general training knowledge about library APIs. Verify imports, function signatures, and module paths by reading the actual source or package.json in this project. Hallucinated imports are a common source of agent failures.
- **Document as you build**: When adding or changing a feature, update the relevant docs in `docs/`. New services get a page in the appropriate section. New config options get added to env var tables. API changes get reflected in the server reference. Follow the rules in `docs/dev/docs-standard.md` — every page must belong to a sidebar section, use `kebab-case.md` naming, and stay under 800 lines. If no appropriate section exists, add the page to the closest match rather than creating a new root-level file.
- **No emojis in docs or code**: Do not use emojis anywhere in documentation, markdown files, comments, or code. The only exceptions are ✅ and ❌ when used as status indicators in documentation tables or checklists.
- **Context window management**: Your context window will be automatically compacted as it approaches its limit. Do not stop tasks early due to token budget concerns. Save progress to git commits before context refreshes. Always be persistent and complete tasks fully.
- **Subagent usage**: Use subagents when tasks can run in parallel, require isolated context, or involve independent workstreams. For simple tasks, sequential operations, or single-file edits, work directly rather than delegating.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or docker)
npm run dev:full            # Web mode — starts UI (:3007) AND server (:3008) together
npm run dev:web             # UI only (localhost:3007) — requires server running separately on :3008
npm run dev:server          # Backend server only (localhost:3008)
npm run dev:headless        # Production-mode server locally (builds packages + server first)

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
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
│   ├── ui/           # React + Vite frontend (port 3007)
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
@protolabsai/utils, @protolabsai/prompts, @protolabsai/platform, @protolabsai/model-resolver, @protolabsai/dependency-resolver, @protolabsai/spec-parser, @protolabsai/tools, @protolabsai/flows, @protolabsai/observability
    ↓
@protolabsai/git-utils, @protolabsai/ui
    ↓
@protolabsai/server, @protolabsai/ui (apps)
```

### Key Technologies

- **Frontend**: React 19, Vite 7, TanStack Router, Zustand 5, Tailwind CSS 4
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

### Scheduler & Timer Registry

All recurring background operations MUST register through `SchedulerService` — never use raw `setInterval`. The Timer Registry provides visibility, pause/resume control, and metrics tracking for all timers.

```typescript
// Cron tasks (fixed schedule)
await schedulerService.registerTask('my-task', 'Task Name', '*/5 * * * *', handler, true);

// Interval tasks (fixed delay)
schedulerService.registerInterval('my-interval', 'Interval Name', 30_000, handler, {
  category: 'health',
});
```

Categories: `maintenance`, `health`, `monitor`, `sync`, `system`. All timers appear in the Ops Dashboard (`/ops` → Timers tab) and via `GET /api/ops/timers`.

**Timer vs. Maintenance Check**: Use a timer for simple recurring operations (polling, syncing). Use a `MaintenanceCheck` module for board health inspections that detect issues and apply auto-fixes. See `docs/internal/server/timer-registry.md` and `docs/internal/server/maintenance-checks.md`.

### Webhook Reliability

Webhook endpoints (`/api/github/webhook`, `/api/webhooks/github`) are wrapped with:

- **Rate limiting** — Token bucket, 100 req/min per IP (middleware in `apps/server/src/middleware/rate-limiter.ts`)
- **Delivery tracking** — `WebhookDeliveryService` records every delivery with status, timing, and retry history
- **Secret rotation** — `POST /api/github/rotate-secret` generates a new secret, keeps the old one valid for 24h (dual-secret verification)
- **Event routing** — `EventRouterService` wraps `SignalIntakeService` with delivery tracking, accessible via `GET /api/ops/deliveries`

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

Auto-mode uses a tiered model selection based on feature complexity. Defaults route through the protoLabs gateway (`api.proto-labs.ai`) so the gateway-issued API key is the only credential needed out of the box. Override per-tier in **Settings → AI Models → Model Defaults**.

| Tier          | Default               | Triggered By                                       |
| ------------- | --------------------- | -------------------------------------------------- |
| **Reasoning** | `protolabs/reasoning` | `complexity: 'architectural'` or after 2+ failures |
| **Smart**     | `protolabs/smart`     | `complexity: 'medium'` or `'large'`                |
| **Fast**      | `protolabs/fast`      | `complexity: 'small'`                              |

The reasoning tier is for system-design, spec generation, and deep-thinking work. Smart is the workhorse for ticket-level feature implementation. Fast is for trivial / quick tasks (commits, branch names, file descriptions).

**Auto-escalation:** Features that fail 2+ times automatically escalate to `DEFAULT_MODELS.claude` (`protolabs/reasoning`) on retry.

**Setting complexity via MCP:**

```typescript
mcp__protolabs__create_feature({
  projectPath: '/path/to/project',
  title: 'Core Infrastructure Setup',
  description: '...',
  complexity: 'architectural', // Routes to protolabs/reasoning
});
```

### Custom Workflows

Features can use a `workflow` field to control which pipeline phases run, which processors handle them, and execution settings. 12 built-in workflows ship with the product. See `docs/guides/custom-workflows.md` for the full reference.

```typescript
mcp__protolabs__create_feature({
  projectPath: '/path/to/project',
  title: 'Security audit of auth module',
  description: '...',
  workflow: 'audit', // Read-only, no git ops, goes to done
});
```

Key workflows: `standard` (default, full code pipeline), `audit` (read-only), `research` (investigation), `postmortem` (incident analysis, Opus), `strategic-review` (goals/gaps, Opus).

Use `list_workflows` MCP tool to discover available workflows for a project. Projects can define custom workflows in `.automaker/workflows/{name}.yml`.

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key (or use Claude Code CLI auth)
- `HOST` - Host to bind server to (default: 0.0.0.0)
- `HOSTNAME` - Hostname for user-facing URLs (default: localhost)
- `PORT` - Server port (default: 3008)
- `DATA_DIR` - Data storage directory (default: ./data)
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `AUTOMAKER_MOCK_AGENT=true` - Enable mock agent mode for CI testing
- `AUTOMAKER_AUTO_LOGIN=true` - Skip login prompt in development (disabled when NODE_ENV=production)
- `AUTOMAKER_MAX_CONCURRENCY` - Instance-wide hard cap on concurrent agents (clamped 1-20, default 2). The ceiling all per-project/global concurrency settings are capped by. See `docs/reference/auto-mode.md` → Concurrency resolution.
- `AUTOMAKER_SKIP_COMPLIANCE_CHECK=1` - Bypass the app-compliance gate that otherwise refuses to run auto-mode on apps missing the fleet standard (branch protection, .gitignore). Escape hatch only.
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

**GitHub Operations:** `merge_pr`, `check_pr_status`, `resolve_pr_threads`, `add_github_comment` (post a comment to an existing issue)

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
base branch (prBaseBranch, default: main)
  ↑
epic/foundation ──────────── Epic PR (targets the base branch)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

This repo uses a single integration branch (`feature/* → main`). The epic flow inserts an
epic branch between feature branches and the base branch — it does **not** introduce a separate
long-lived `dev` branch. Everywhere below, "base branch" means the project's configured
`prBaseBranch` (`DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch`, default `main`), resolved via
`getEffectivePrBaseBranch()`. Never hardcode a branch name in orchestration code.

**Automatic Behavior:**

- Epic branches are created from the resolved base branch HEAD (`origin/<base>`), not a literal.
- Feature PRs automatically target their epic's branch (not the base branch directly).
- Epic PRs target the base branch (never bypass it).
- Features without an epic target the base branch directly.
- When the last child feature's PR merges to the epic branch, `CompletionDetectorService` automatically creates the epic-to-base PR with `--merge` auto-merge enabled.
- When the epic-to-base PR merges (detected by GitHub webhook), the epic is marked `done` and the epic branch is deleted.
- If the epic-to-base PR has conflicts, the epic is marked `blocked` with a reason explaining manual intervention is needed.

**Epic Lifecycle:**

```
children in_progress → children done → epic PR created (review) → epic PR merges → epic done
```

**Merge Order:**

1. Merge all feature PRs into the epic branch (squash OK)
2. Epic-to-base PR is auto-created and auto-merged with `--merge` strategy (never squash)

This keeps the base branch clean while allowing incremental feature development within epics.

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
