# Automaker Agent Guide

## CRITICAL: Scope Discipline

Implement EXACTLY what the feature description says. Nothing more, nothing less.

- If the description says "create ServiceX", create ONLY ServiceX. Do NOT wire it into the server, create routes, or modify index.ts unless explicitly asked.
- If the description says "add types", add ONLY types. Do NOT create services that use those types.
- Other features in the backlog handle remaining work. Over-delivering creates merge conflicts and blocks other agents.
- When in doubt about scope, do LESS, not more.

## CRITICAL: Turn Budget

You have limited turns. Do NOT spend more than 20% exploring.

- Turns 1-3: Read feature description, identify the 2-3 files to modify
- Turns 4-6: Read ONLY those specific files
- Remaining turns: WRITE CODE
- If you're still reading files after turn 8, you're behind schedule
- Do NOT try to understand the entire codebase. Focus ONLY on files directly relevant to your task.

## Monorepo Structure

```
automaker/
├── apps/
│   ├── ui/           # React + Vite frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
└── libs/             # Shared packages (@protolabs-ai/*)
    ├── types/        # Core TypeScript definitions (NO dependencies)
    ├── utils/        # Logging, errors, image processing
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security
    ├── model-resolver/    # Model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    ├── policy-engine/     # Trust-based policy checking
    ├── spec-parser/       # XML/markdown spec parsing
    ├── git-utils/    # Git operations & worktree management
    └── ui/           # Shared UI components (atoms, molecules, theme)
```

## Package Dependency Chain (top = no deps)

```
@protolabs-ai/types
    ↓
@protolabs-ai/utils, prompts, platform, model-resolver, dependency-resolver, policy-engine, spec-parser
    ↓
@protolabs-ai/git-utils
    ↓
apps/server, apps/ui
```

## CRITICAL: Build Order

If you modify ANY file in `libs/`:

1. `npm run build:packages` FIRST
2. Then `npm run build:server`

Packages compile to `dist/`. Other packages import from `dist/`, NOT source.
Stale `dist/` = wrong types = wasted work.

## Import Conventions

```typescript
// ALWAYS import from packages
import type { Feature, ExecutionRecord } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';

// NEVER import from relative paths to other packages
// ❌ import { Feature } from '../services/feature-loader';
```

## Frontend UI Standards

For all frontend work, follow the UI standards in `ui-standards.md`. Always use shared components from `@protolabs-ai/ui` -- never bare HTML elements (`<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`). Never hardcode color classes (`bg-gray-*`, `text-blue-*`); always use semantic tokens (`bg-card`, `text-foreground`, `border-border`).

## Before Creating New Types

ALWAYS check `libs/types/src/` first. Types for features, settings, events, ceremonies, etc. already exist.
If a type exists, import it from `@protolabs-ai/types`. Do NOT recreate it.

## Key Existing Types (libs/types/src/)

- `Feature`, `FeatureStatus`, `ExecutionRecord`, `StatusTransition` — feature.ts
- `CeremonySettings`, `CeremonyType` — ceremony.ts, settings.ts
- `GitWorkflowSettings`, `GitWorkflowResult` — settings.ts
- `ProjectMetrics`, `CapacityMetrics` — (if they exist, check first)
- `EventType`, `EventCallback` — event.ts

## Server Service Pattern

Services are classes in `apps/server/src/services/`:

```typescript
import { createLogger } from '@protolabs-ai/utils';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('MyService');

export class MyService {
  constructor(private featureLoader: FeatureLoader) {}

  async doWork(projectPath: string) {
    const features = await this.featureLoader.getAll(projectPath);
    // ...
  }
}
```

## Common Commands

```bash
npm run build:packages      # Build shared packages (MUST run first)
npm run build:server        # Build server
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # Package tests
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Feature Data Fields (Feature interface)

Key fields available on every feature:

- `executionHistory?: ExecutionRecord[]` — per-execution timing, cost, tokens
- `costUsd?: number` — total cost
- `createdAt?, completedAt?, startedAt?, reviewStartedAt?` — lifecycle timestamps
- `prCreatedAt?, prMergedAt?, prReviewDurationMs?` — PR lifecycle
- `statusHistory?: StatusTransition[]` — all status changes
- `failureCount?, retryCount?` — failure tracking
- `complexity?: 'small' | 'medium' | 'large' | 'architectural'`

## Git Workflow — Three-Branch Strategy

All agent PRs target **`dev`** by default. The promotion flow is:

```text
feature/* ──▶ dev ──▶ staging ──▶ main
```

- **`dev`**: Active development. All agent-generated PRs land here.
- **`staging`**: Integration / QA environment. Promoted from `dev` via PR. Auto-deploys.
- **`main`**: Stable release only. PRs to `main` **must** come from `staging` — enforced by CI (`promotion-check`). Any PR to `main` from another branch will fail the `source-branch` required check.

**Never open a PR directly from a feature branch to `main`.** If you need to create a PR manually, target `dev`:

```bash
gh pr create --base dev --head feature/your-branch --title "..." --body "..."
```

The `gitWorkflow.prBaseBranch` setting is `"dev"` — auto-mode and the git workflow service read this automatically.

## Dev Server

NEVER start, stop, or restart the dev server. It's managed externally.

## PR Ownership (Multi-Instance Coordination)

When implementing features, every PR created by Automaker contains a hidden ownership watermark:

```html
<!-- automaker:owner instance=<instanceId> team=<teamId> created=<ISO8601> -->
```

This is appended automatically by `create-pr.ts` via `buildPROwnershipWatermark()`. You do not need to add it manually.

**WorktreeRecoveryService** runs after every agent exit. If you leave uncommitted changes in the worktree, it will:

1. Format changed files with `npx prettier --ignore-path /dev/null --write <files>`
2. Stage (excluding `.automaker/` runtime files — but NOT memory/context, those are your responsibility)
3. Commit with `HUSKY=0`
4. Push and create a PR

If recovery fails, the feature is marked `blocked` with a `statusChangeReason`. The Lead Engineer will escalate rather than retry — retrying the agent won't resolve a git or network failure.

**Implication**: Commit your work before exiting. The recovery service is a safety net, not a substitute for proper commits.

## Agent Memory Files

If you read or update any file in `.automaker/memory/`, commit those changes in the same commit as your code changes. The `WorktreeRecoveryService` excludes `.automaker/` from auto-staging — memory drift is never automatically recovered. Stage memory files explicitly:

```bash
git add .automaker/memory/
git add <your code files>
HUSKY=0 git commit -m "feat: ..."
```

## CRITICAL: Prettier Formatting — Always Pass `--ignore-path`

Prettier 3.x respects `.gitignore` by default. Since `.worktrees/` is gitignored, running `npx prettier --write` (without `--ignore-path`) silently skips ALL files in `.worktrees/` — no formatting, no error. This causes CI format failures on every agent PR.

**Always use this exact command when formatting manually:**

```bash
npx prettier --ignore-path /dev/null --write <files>
```

Or to check before committing:

```bash
npm run format:check
```

**Never use** `prettier --write` without `--ignore-path /dev/null` in a worktree context.

## CRITICAL: TypeScript Validation — Run Before Commit

Every agent **must** run `npm run typecheck` before considering work complete. TypeScript type checking is enforced in CI — PRs with type errors will be rejected.

**Before committing, run:**

```bash
npm run typecheck
```

This runs `tsc --noEmit` on the UI and server. If there are errors in files you modified, fix them. If errors exist in files you did NOT modify, note them in your agent output but do not block on them.

**Common patterns that introduce type errors:**

- Adding a property to a type but not updating all consumers
- Importing a type that was renamed or moved
- Passing `null` where `undefined` is expected (use `?? undefined`)
- Missing type annotations on callback parameters in `.find()`, `.map()`, `.filter()`

## Verdict System (All Feature Agents)

All feature agents (kai, matt, sam, frank, and any future agents) **must** follow the Verdict System pattern when surfacing findings from analysis, review, or audit tasks.

### Confidence Threshold

Only surface findings with **>80% certainty**. If you cannot confirm an issue with high confidence, omit it or note it as "unverified — needs further investigation."

### Consolidation Rule

Consolidate similar findings into a single item. Do not list the same class of problem multiple times.

> Example: Instead of listing 3 separate "missing error handling" findings, report: `3 files missing error handling` as one item.

### Verdict Block Format

End **every response** that includes findings with a structured verdict block:

```
---
VERDICT: [APPROVE|WARN|BLOCK]
Issues: [count]
[CRITICAL|HIGH|MEDIUM|LOW]: [brief description]
---
```

**Verdict definitions:**

- **APPROVE** — No critical or high issues found. Safe to proceed.
- **WARN** — Only medium or low issues found. Proceed with caution; remediation recommended but not blocking.
- **BLOCK** — One or more critical issues present. Remediation required before proceeding.

**Severity definitions:**

- **CRITICAL** — System failure, data loss, security breach, or major regression likely
- **HIGH** — Major functional breakage or significant risk
- **MEDIUM** — Degraded experience or moderate risk
- **LOW** — Minor issue, style, or technical debt

If no issues are found, emit: `VERDICT: APPROVE` with `Issues: 0`.

## Skill System

When available skills exist for this project, you will see an `<available_skills>` block in your system prompt listing each skill by name, description, and file path.

**How to use skills:**

1. Review the `<available_skills>` list at the start of your task
2. If a skill name or description matches your current task, read the full skill file:
   ```
   read_file(".automaker/skills/{name}.md")
   ```
3. Follow the instructions in the skill file — they encode proven patterns for this project

**When a skill applies:**

- The skill name or description relates to what you are implementing
- You are about to do something the skill explicitly covers (e.g., build order, PR creation, testing)
- Following the skill avoids a known class of mistakes

**Do NOT load all skills.** Only read the skill file when the task clearly matches. Skills are metadata-only in the prompt to minimize token usage — content is fetched on demand.

**Skill location:** `.automaker/skills/{name}.md`

## Verdict System

At the end of every response, output a verdict block summarizing your confidence in the work:

```
---
VERDICT: [APPROVE|WARN|BLOCK]
Issues: [count]
[CRITICAL|HIGH|MEDIUM|LOW]: [brief description]
---
```

**Rules:**
- Only surface findings with **>80% certainty**
- Consolidate similar findings (e.g. "3 files missing error handling" → one item)
- **APPROVE** — No critical or high issues. Work is solid.
- **WARN** — Medium/low issues only. Proceed with caution.
- **BLOCK** — Critical issues present. Remediation required before PR.
