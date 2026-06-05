# Worktree Recovery Service

Post-agent safety net that detects uncommitted work after an agent exits and **preserves it (commit + push)**. It does **not** create a PR — PR creation is owned by the single guarded chokepoint (`GitWorkflowService.runPostCompletionWorkflow`), per the pure-executor principle.

## Overview

`checkAndRecoverUncommittedWork` is a standalone async function (not a class) called as a post-agent hook after every agent execution. When the agent exits without committing its changes, this service:

1. **Detects** uncommitted changes via `git status --short`
2. **Formats** changed files with Prettier (non-fatal if it fails)
3. **Stages** changes using pathspec-based `git add`, with fallback to `git add .`
4. **Commits** with `--no-verify` and `HUSKY=0` to bypass pre-commit hooks
5. **Rebases** onto `origin/<baseBranch>` to avoid diverging from the base
6. **Pushes** the branch to remote — and **stops there**

It never calls `gh pr create` or enables auto-merge. The net exists only to keep work from being lost; turning that work into a PR is a separate, guarded step. The function returns a structured `WorktreeRecoveryResult`; the **caller** updates feature status and emits events.

## Recovery Flow

```text
checkAndRecoverUncommittedWork(feature, worktreePath, projectPath, prBaseBranch?)
  → git status --short
      → empty?  → return { detected: false, recovered: false }
  → detected: true
  → Step 1: prettier --write <changed TS/JS/JSON/CSS/MD files>  (non-fatal)
  → Step 2: buildGitAddCommand() → git add <pathspecs>
      → nothing staged? → fallback: git add .
  → Step 3: git commit --no-verify -m "refactor: <feature title>"  (HUSKY=0)
  → Step 3.5: git fetch origin <baseBranch> && git rebase origin/<baseBranch>
      → conflict? → git rebase --abort, push without rebase
  → Step 4: git push [--force-with-lease] -u origin <branchName>
  → return { detected: true, recovered: true }   // work preserved; NO PR
```

## Rebase Strategy

After committing, the service fetches and rebases onto `origin/<baseBranch>` (default: `main`). This keeps the pushed branch from diverging from the base.

- **On success:** push uses `--force-with-lease` (safe force push)
- **On conflict:** the rebase is aborted, push proceeds without the force flag

Branch name is sanitized (`/[^a-zA-Z0-9_./-]/g` stripped) to prevent shell injection.

## Result Type

```typescript
interface WorktreeRecoveryResult {
  detected: boolean; // uncommitted changes were found
  recovered: boolean; // work preserved (commit + push succeeded); PR creation is NOT done here
  error?: string; // message if recovery failed
}
```

## Staging Behaviour

Git staging uses `buildGitAddCommand()` from `git-staging-utils` which generates a pathspec that excludes `.automaker/` (except `memory/` and `skills/` subdirectories). This prevents accidental staging of execution state or secrets.

If the pathspec stages nothing (e.g., all files are in unusual locations), the service falls back to `git add .` — safe because worktrees are isolated per-feature.

## Key Files

| File                                                      | Role                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| `apps/server/src/services/worktree-recovery-service.ts`   | Core function `checkAndRecoverUncommittedWork` |
| `apps/server/src/lib/git-staging-utils.ts`                | `buildGitAddCommand()` — pathspec builder      |
| `apps/server/src/services/auto-mode/execution-service.ts` | Calls recovery after agent exits               |
| `libs/git-utils/src/index.ts`                             | `createGitExecEnv()` for process environment   |

## See Also

- [Git Workflow Service](./git-workflow-service) — the happy-path git pipeline and the single guarded PR-creation chokepoint (`runPostCompletionWorkflow`)
- [Lead Engineer Service](./lead-engineer-service) — owns the execution loop that triggers recovery
