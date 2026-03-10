# GitHub Merge Service

Merges pull requests via the `gh` CLI with CI status awareness, auto-merge support, and CodeRabbit failure tolerance.

## Overview

`GitHubMergeService` is the low-level PR merge executor used by `GitWorkflowService`. It:

- **Checks CI status** before attempting merge
- **Enables auto-merge** when checks are still pending (lets GitHub merge once CI passes)
- **Treats CodeRabbit FAILURE as transient** — counts it as pending, not a hard failure
- **Verifies PR state** after the merge command to confirm success vs auto-merge-pending

## Architecture

```text
GitHubMergeService
  ├── checkPRStatus()    — gh pr view → CI check breakdown
  ├── mergePR()          — CI gate + gh pr merge --auto
  └── canMergePR()       — lightweight eligibility check
```

### Merge Decision Flow

```text
mergePR(workDir, prNumber, strategy, waitForCI)
  → checkPRStatus()
      → gh pr view --json statusCheckRollup
      → Classify each check: passed / failed / pending
      → CodeRabbit FAILURE → reclassified as pending (transient)
  → If pendingCount > 0:
      → gh pr merge --auto  (GitHub merges when checks pass)
      → return { success: true, autoMergeEnabled: true, checksPending: true }
  → If failedCount > 0:
      → return { success: false, checksFailed: true, failedChecks: [...] }
  → If all checks pass:
      → gh pr merge --<strategy> --auto
      → Verify PR state via gh pr view --json state
      → MERGED  → { success: true, mergeCommitSha }
      → OPEN    → { success: false, autoMergeEnabled: true }  ← waiting for checks
      → Other   → { success: false, error: "unexpected state" }
```

## CodeRabbit Tolerance

CodeRabbit frequently sets commit status to `FAILURE` when processing multiple PRs simultaneously (rate-limiting). This service detects any check whose name contains `"coderabbit"` and has `conclusion === "failure"`, then reclassifies it as **pending** rather than failed. This prevents legitimate PRs from being blocked by a transient bot issue.

```typescript
if (checkIdentifier.includes('coderabbit') && conclusion === 'failure') {
  // treat as transient pending — do not count as hard failure
  pendingCount++;
  continue;
}
```

## Merge Strategies

| Strategy | Flag       | Description                           |
| -------- | ---------- | ------------------------------------- |
| `squash` | `--squash` | Squash all commits into one (default) |
| `merge`  | `--merge`  | Standard merge commit                 |
| `rebase` | `--rebase` | Rebase commits onto base branch       |

## Result Types

```typescript
interface PRMergeResult {
  success: boolean;
  mergeCommitSha?: string; // present on MERGED state
  autoMergeEnabled?: boolean; // true when GitHub will merge later
  checksPending?: boolean; // true when CI still running
  checksFailed?: boolean; // true when CI hard-failed
  failedChecks?: string[]; // names of failed checks
  error?: string;
}

interface PRCheckStatus {
  allChecksPassed: boolean;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  failedChecks: string[];
}
```

## Key Files

| File                                                    | Role                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/server/src/services/github-merge-service.ts`      | Service implementation (singleton exported as `githubMergeService`) |
| `apps/server/src/services/git-workflow-service.ts`      | Primary caller                                                      |
| `apps/server/src/services/merge-eligibility-service.ts` | Higher-level eligibility evaluation                                 |

## See Also

- [Git Workflow Service](./git-workflow-service) — orchestrates merge as part of the full post-execution pipeline
- [Merge Eligibility Service](./merge-eligibility-service) — evaluates auto-merge settings before merge is attempted
- [CodeRabbit Resolver Service](./coderabbit-resolver-service) — resolves bot threads before merge
