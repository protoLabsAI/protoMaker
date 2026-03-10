# Worktree Recovery Service

Post-agent safety net that detects uncommitted work after an agent exits and automatically creates a PR to preserve the work.

## Overview

`checkAndRecoverUncommittedWork` is a standalone async function (not a class) called as a post-agent hook after every agent execution. When the agent exits without committing its changes, this service:

1. **Detects** uncommitted changes via `git status --short`
2. **Formats** changed files with Prettier (non-fatal if it fails)
3. **Stages** changes using pathspec-based `git add`, with fallback to `git add .`
4. **Commits** with `--no-verify` and `HUSKY=0` to bypass pre-commit hooks
5. **Rebases** onto `origin/<baseBranch>` to avoid conflicting PRs
6. **Pushes** the branch to remote
7. **Creates a PR** via `gh pr create` and **enables auto-merge** (`--squash`)

The function returns a structured `WorktreeRecoveryResult`. The **caller** is responsible for updating feature status and emitting events.

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
  → Step 4: git push [-–force-with-lease] -u origin <branchName>
  → Step 5: gh pr create --base <baseBranch> --head <branchName>
  → gh pr merge <prNumber> --auto --squash
  → return { detected: true, recovered: true, prUrl, prNumber, prCreatedAt }
```

## Rebase Strategy

After committing, the service fetches and rebases onto `origin/<baseBranch>` (default: `dev`). This prevents the PR from diverging from the base branch.

- **On success:** push uses `--force-with-lease` (safe force push)
- **On conflict:** rebases is aborted, push proceeds without force flag

Branch name is sanitized (`/[^a-zA-Z0-9_./-]/g` stripped) to prevent shell injection.

## Result Type

```typescript
interface WorktreeRecoveryResult {
  detected: boolean; // uncommitted changes were found
  recovered: boolean; // commit + push + PR succeeded
  prUrl?: string; // e.g., https://github.com/org/repo/pull/42
  prNumber?: number;
  prCreatedAt?: string; // ISO-8601 timestamp
  error?: string; // message if recovery failed
}
```

## Staging Behaviour

Staging uses `buildGitAddCommand()` from `git-staging-utils` which generates a pathspec that excludes `.automaker/` (except `memory/` and `skills/` subdirectories). This prevents accidental staging of execution state, secrets, or CRDT data.

If the pathspec stages nothing (e.g., all files are in unusual locations), the service falls back to `git add .` — safe because worktrees are isolated per-feature.

## Key Files

| File                                                      | Role                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| `apps/server/src/services/worktree-recovery-service.ts`   | Core function `checkAndRecoverUncommittedWork` |
| `apps/server/src/lib/git-staging-utils.ts`                | `buildGitAddCommand()` — pathspec builder      |
| `apps/server/src/services/auto-mode/execution-service.ts` | Calls recovery after agent exits               |
| `libs/git-utils/src/index.ts`                             | `createGitExecEnv()` for process environment   |

## See Also

- [Git Workflow Service](./git-workflow-service) — the primary happy-path git pipeline (agent commits correctly)
- [Auto Mode Service](./auto-mode-service) — owns the execution loop that triggers recovery
