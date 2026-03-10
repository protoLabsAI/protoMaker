# Git Workflow Service

Post-execution automation that commits, pushes, and creates pull requests after agents successfully complete features.

## Overview

`GitWorkflowService` runs immediately after an agent finishes a feature in auto-mode. It handles the full git pipeline:

- **Commit** staged changes with a feature-title-derived message
- **Push** the branch to remote
- **Create PR** via `gh` CLI with issue-closing references
- **Resolve bot review threads** via `CodeRabbitResolverService`
- **Merge** the PR according to configured `AutoMergeSettings`
- **Retry** all operations with exponential backoff (3 attempts: 2s, 4s, 8s delays)

## Architecture

```text
GitWorkflowService
  ├── commitAndPush()           — stage, commit, push
  ├── createPullRequest()       — gh pr create with ownership watermark
  ├── mergePR()                 — CodeRabbitResolverService + GitHubMergeService
  └── merge()                   — public entry point (full pipeline)
```

### Full Pipeline Flow

```text
merge(feature, worktreePath, settings)
  → commitAndPush()
      → git add (pathspec-based staging)
      → git commit -m "feat: <title>"
      → git push -u origin <branch>
  → createPullRequest()
      → Build PR body with feature summary + issue close refs ("Closes #<id>")
      → Append PR ownership watermark
      → gh pr create --base <prBaseBranch>
  → mergePR()
      → codeRabbitResolverService.resolveThreads()   — clear bot threads
      → mergeEligibilityService.evaluatePR()          — check auto-merge settings
      → githubMergeService.mergePR()                  — gh pr merge
  → GitWorkflowResult
```

## Configuration

Settings come from `GitWorkflowSettings` in `.automaker/settings.json`:

```typescript
interface GitWorkflowSettings {
  commitMessage?: string;        // default: derived from feature title
  prBaseBranch?: string;         // default: 'dev'
  prTemplate?: string;           // PR body template
  autoMerge?: boolean;           // enable auto-merge
  mergeStrategy?: PRMergeStrategy; // 'merge' | 'squash' | 'rebase'
  closeIssues?: boolean;         // add "Closes #<id>" refs
}
```

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `prBaseBranch` | `'dev'` | Target branch for PR creation |
| `mergeStrategy` | `'squash'` | How the PR is merged |
| `autoMerge` | `true` | Enable GitHub auto-merge if CI is pending |
| `closeIssues` | `true` | Include issue-closing references in PR body |

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

| File | Role |
| ---- | ---- |
| `apps/server/src/services/git-workflow-service.ts` | Core service — full pipeline |
| `apps/server/src/services/github-merge-service.ts` | PR merge via gh CLI |
| `apps/server/src/services/merge-eligibility-service.ts` | Auto-merge eligibility checks |
| `apps/server/src/services/coderabbit-resolver-service.ts` | Bot thread resolution pre-merge |
| `apps/server/src/routes/github/utils/pr-ownership.ts` | PR watermark builder |
| `apps/server/src/lib/git-staging-utils.ts` | Pathspec-based git add command builder |

## See Also

- [Worktree Recovery Service](./worktree-recovery-service) — fallback path when agent exits with uncommitted work
- [Auto Mode Service](./auto-mode-service) — calls `gitWorkflowService.merge()` on execution success
- [GitHub Merge Service](./github-merge-service) — handles the actual merge call
