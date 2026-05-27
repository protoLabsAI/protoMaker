# GitHub Merge Service

Merges pull requests via the `gh` CLI with CI status awareness and CodeRabbit failure tolerance. **The platform owns the merge decision** — it never enables GitHub-native auto-merge.

## Overview

`GitHubMergeService` is the low-level PR merge executor used by `GitWorkflowService`. It:

- **Checks CI status** before attempting merge (`checkPRStatus` over the full status-check rollup; `allChecksPassed = 0 failed && 0 pending`)
- **Never enables GitHub auto-merge.** `gh pr merge --auto` was removed (see "Why no auto-merge"). On pending checks it reports `checksPending` and does **not** merge; the caller (e.g. the REVIEW phase) re-checks later.
- **Merges explicitly only when every check is green** — `gh pr merge --<strategy>` with no `--auto`.
- **Treats CodeRabbit FAILURE as transient** — counts it as pending, not a hard failure
- **Verifies PR state** after the merge command to confirm it actually merged

## Why no auto-merge

GitHub-native auto-merge (`gh pr merge --auto`) honors only the repo's **required** branch-protection checks. A check that isn't in the required set (e.g. a newly-added linter) can be **failing** while auto-merge still merges the moment the required ones go green — exactly how a broken PR once landed (#3878 / #3881). Delegating the merge to GitHub also bypasses this service's own stricter gate.

So the platform owns the merge end to end: it merges **only** via an explicit `gh pr merge` after confirming **all** non-soft checks are complete and green. This holds for every managed app regardless of how complete that repo's required-checks list is. (The same applies to epic→base PRs in `completion-detector-service`, which route through `mergePR` rather than `--auto`.)

## Architecture

```text
GitHubMergeService
  ├── checkPRStatus()    — gh pr view → CI check breakdown (allChecksPassed = 0 failed && 0 pending)
  ├── mergePR()          — CI gate + explicit gh pr merge (NO --auto)
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
      → DO NOT merge, DO NOT enable auto-merge
      → return { success: false, checksPending: true, autoMergeEnabled: false }
        (the REVIEW phase polls and retries once checks are green)
  → If failedCount > 0:
      → return { success: false, checksFailed: true, failedChecks: [...] }
  → If all checks pass:
      → gh pr merge --<strategy>     ← explicit, immediate, no --auto
      → Verify PR state via gh pr view --json state
      → MERGED  → { success: true, mergeCommitSha }
      → OPEN    → { success: false }  ← branch protection still blocking; retry later
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
