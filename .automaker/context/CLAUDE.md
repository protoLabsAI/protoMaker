# Automaker Agent Guide

> **Note:** This file contains agent-specific and worktree-specific guidance.
> For monorepo structure, git workflow, architecture, commands, import conventions,
> environment variables, and MCP tools — see the root `CLAUDE.md`.

## CRITICAL: Session Resume — Check State Before Starting

Before creating any todo list or writing any code, ALWAYS audit your worktree to understand what was already done:

```bash
# 1. Check which files already exist or are modified
git -C /home/josh/dev/ava/.worktrees/<your-branch> status --short

# 2. Check if there are already commits on the branch
git -C /home/josh/dev/ava/.worktrees/<your-branch> log --oneline origin/dev..HEAD
```

If files exist (shown as `??` untracked or ` M` modified), you are **resuming a previous session**. Do NOT recreate those files. Do NOT re-run steps that produced those files. Understand what already exists, then continue from where the previous session left off.

**Common resume signals:**
- `?? apps/server/src/services/foo-service.ts` → service was written, skip to wiring/testing
- `?? apps/server/src/routes/foo/` → routes exist, skip to mounting them in routes.ts
- ` M apps/server/src/server/services.ts` → already wired, skip that step
- No new commits on branch → work was done but not committed yet → skip to format+commit

**If you receive a message from the supervisor with "CONTEXT RESTORE"** — trust it completely. It tells you exactly what is done and what remains. Do exactly what it says.

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

## Frontend UI Standards

For all frontend work, follow the UI standards in `ui-standards.md`. Always use shared components from `@protolabsai/ui` — never bare HTML elements (`<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`). Never hardcode color classes (`bg-gray-*`, `text-blue-*`); always use semantic tokens (`bg-card`, `text-foreground`, `border-border`).

## Before Creating New Types

ALWAYS check `libs/types/src/` first. Types for features, settings, events, ceremonies, etc. already exist.
If a type exists, import it from `@protolabsai/types`. Do NOT recreate it.

## Key Existing Types (libs/types/src/)

- `Feature`, `FeatureStatus`, `ExecutionRecord`, `StatusTransition` — feature.ts
- `CeremonySettings`, `CeremonyType` — ceremony.ts, settings.ts
- `GitWorkflowSettings`, `GitWorkflowResult` — settings.ts
- `EventType`, `EventCallback` — event.ts
- `Project`, `Milestone`, `Phase`, `SPARCPrd` — project.ts

## Server Service Pattern

Services are classes in `apps/server/src/services/`:

```typescript
import { createLogger } from '@protolabsai/utils';
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

## Feature Data Fields (Feature interface)

Key fields available on every feature:

- `executionHistory?: ExecutionRecord[]` — per-execution timing, cost, tokens
- `costUsd?: number` — total cost
- `createdAt?, completedAt?, startedAt?, reviewStartedAt?` — lifecycle timestamps
- `prCreatedAt?, prMergedAt?, prReviewDurationMs?` — PR lifecycle
- `statusHistory?: StatusTransition[]` — all status changes
- `failureCount?, retryCount?` — failure tracking
- `complexity?: 'small' | 'medium' | 'large' | 'architectural'`

## CRITICAL: File Edit Path Discipline

You work in a git worktree at a path like `<repo_root>/.worktrees/<branch>/`. ALL file edits MUST use the worktree path. NEVER use the main repo path for edits. To find the repo root, use `git rev-parse --show-toplevel` or check the `projectPath` from your feature context.

**Why this matters:** Git worktrees share the same `.git` directory but have SEPARATE working directories. If you edit `<repo_root>/apps/server/src/server/routes.ts` instead of `<repo_root>/.worktrees/<branch>/apps/server/src/server/routes.ts`, you corrupt the main working tree.

**The only time to use the main repo path is for `bash` build/test commands:**
```bash
# CORRECT — run builds from main root (node_modules lives there)
cd <repo_root> && npm run build:packages
cd <repo_root> && npm run build:server

# CORRECT — all file edits use the worktree path
edit("<repo_root>/.worktrees/<branch>/apps/server/src/server/routes.ts", ...)

# WRONG — edits using the main repo path corrupt the main working tree
edit("<repo_root>/apps/server/src/server/routes.ts", ...)
```

**Finding your worktree path:** The feature description and system prompt contain your worktree path. It is always `<repo_root>/.worktrees/<your-branch-name>/`.

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

**Implication**: Commit your work before exiting. The recovery service is a safety net, not a substitute for proper commits.

## Agent Memory Files

If you read or update any file in `.automaker/memory/`, commit those changes in the same commit as your code changes. The `WorktreeRecoveryService` excludes `.automaker/` from auto-staging — memory drift is never automatically recovered. Stage memory files explicitly:

```bash
git add .automaker/memory/
git add <your code files>
HUSKY=0 git commit -m "feat: ..."
```

## Prettier Formatting

Prettier formatting in worktrees is handled automatically by the server's git-workflow and worktree-recovery services — they use the main repo's prettier binary with `--ignore-path /dev/null`. If you need to format manually in a worktree, use: `npx prettier --ignore-path /dev/null --write <files>`.

## CRITICAL: TypeScript Validation — Run Before Commit

Every agent **must** run `npm run typecheck` before considering work complete. TypeScript type checking is enforced in CI — PRs with type errors will be rejected.

**Common patterns that introduce type errors:**

- Adding a property to a type but not updating all consumers
- Importing a type that was renamed or moved
- Passing `null` where `undefined` is expected (use `?? undefined`)
- Missing type annotations on callback parameters in `.find()`, `.map()`, `.filter()`

## Skill System

When available skills exist for this project, you will see an `<available_skills>` block in your system prompt listing each skill by name, description, and file path.

**How to use skills:**

1. Review the `<available_skills>` list at the start of your task
2. If a skill name or description matches your current task, read the full skill file:
   ```
   read_file(".automaker/skills/{name}.md")
   ```
3. Follow the instructions in the skill file — they encode proven patterns for this project

**Do NOT load all skills.** Only read the skill file when the task clearly matches.

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

**Severity definitions:**
- **CRITICAL** — System failure, data loss, security breach, or major regression likely
- **HIGH** — Major functional breakage or significant risk
- **MEDIUM** — Degraded experience or moderate risk
- **LOW** — Minor issue, style, or technical debt
