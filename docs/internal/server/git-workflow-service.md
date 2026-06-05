# Git Workflow Service

Post-execution automation that commits, pushes, and creates pull requests after agents successfully complete features.

## Overview

`GitWorkflowService.runPostCompletionWorkflow()` is the **single guarded PR-creation chokepoint**. It runs after an agent finishes a feature and handles the full git pipeline, each step gated by the resolved git-workflow settings:

- **Commit** staged changes with a feature-title-derived message (`autoCommit`)
- **Push** the branch to remote (`autoPush`)
- **Create PR** via `gh` CLI with issue-closing references and an ownership watermark (`autoCreatePR`)
- **Auto-merge** the PR when enabled and eligible (`autoMergePR`)
- **Enforce the epic-base invariant** — features in an epic must base their PR on the epic branch, never on `main` (auto-creates the epic branch on the remote if missing)
- **Retry** push/PR operations with exponential backoff

Read-only features short-circuit before any git work (it logs a warning for `featureType: code` read-only features, since that usually means a mis-route — see [issue #4073]).

## Architecture

`runPostCompletionWorkflow` is the only public workflow entry point; the steps are private helpers it calls in sequence:

```text
runPostCompletionWorkflow(projectPath, featureId, feature, workDir, settings, epicBranchName?, events?, projectPrBaseBranch?)
  → read-only? → log + return null (no git work)
  → resolveGitWorkflowSettings(feature, settings, projectPrBaseBranch)
  → resolve PR base branch (epic-base invariant: epic children base on the epic branch)
  → if autoCommit  → commitChanges()           (pathspec staging + prettier; amend/force paths for already-pushed branches)
  → if autoPush    → pushToRemote()             (--force-with-lease when needed)
  → if autoCreatePR→ createPullRequest()        (PR body + "Closes #<id>" + ownership watermark; size/critical-thread gates)
  → if autoMergePR → CodeRabbit thread resolution + GitHubMergeService merge
  → GitWorkflowResult
```

There is no `merge()` / `commitAndPush()` / `mergePR()` method — those are not real. `saveAgentProgress()` (a lightweight WIP commit+push, no PR) and `resolveGitWorkflowSettings()` are the other public methods.

## Configuration

Settings resolve through `resolveGitWorkflowSettings()`, which merges per-feature `gitWorkflow` overrides over global `GitWorkflowSettings` over `DEFAULT_GIT_WORKFLOW_SETTINGS` (`libs/types/src/git-settings.ts`). Key fields:

| Setting           | Default    | Description                                                |
| ----------------- | ---------- | ---------------------------------------------------------- |
| `autoCommit`      | `true`     | Commit staged changes                                      |
| `autoPush`        | `true`     | Push to remote (requires `autoCommit`)                     |
| `autoCreatePR`    | `true`     | Create the PR (requires `autoPush`)                        |
| `autoMergePR`     | `true`     | Enable auto-merge after creation (requires `autoCreatePR`) |
| `prMergeStrategy` | `'squash'` | How the PR is merged (`merge` \| `squash` \| `rebase`)     |
| `waitForCI`       | —          | Wait for CI before merging                                 |
| `prBaseBranch`    | `'main'`   | Target branch for PR creation                              |

## PR Ownership Watermark

All PRs created by this service include a watermark comment built by `buildPROwnershipWatermark()`. This allows the system to identify agent-created PRs and avoid double-processing them.

## Retry Behaviour

Each of the three phases (commit/push, PR create, merge) is wrapped in `retryWithExponentialBackoff`:

- Max attempts: **3**
- Delays: **2s → 4s → 8s**
- Non-retryable errors (e.g., merge conflicts) are surfaced immediately

## Result

```typescript
interface GitWorkflowResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  mergeCommitSha?: string;
  error?: string;
  commitSha?: string;
  autoMergeEnabled?: boolean;
}
```

## Key Files

| File                                                      | Role                                   |
| --------------------------------------------------------- | -------------------------------------- |
| `apps/server/src/services/git-workflow-service.ts`        | Core service — full pipeline           |
| `apps/server/src/services/github-merge-service.ts`        | PR merge via gh CLI                    |
| `apps/server/src/services/merge-eligibility-service.ts`   | Auto-merge eligibility checks          |
| `apps/server/src/services/coderabbit-resolver-service.ts` | Bot thread resolution pre-merge        |
| `apps/server/src/routes/github/utils/pr-ownership.ts`     | PR watermark builder                   |
| `apps/server/src/lib/git-staging-utils.ts`                | Pathspec-based git add command builder |

## See Also

- [Worktree Recovery Service](./worktree-recovery-service) — fallback path when an agent exits with uncommitted work (commit + push only, no PR)
- [Lead Engineer Service](./lead-engineer-service) — drives feature execution and invokes `runPostCompletionWorkflow` on success
- [GitHub Merge Service](./github-merge-service) — handles the actual merge call
