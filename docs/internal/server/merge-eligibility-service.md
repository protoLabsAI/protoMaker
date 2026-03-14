# Merge Eligibility Service

Evaluates whether a pull request satisfies all configured auto-merge criteria before a merge is attempted.

## Overview

`MergeEligibilityService` fetches comprehensive PR data from GitHub and runs each configured check type against it. It is called by `GitWorkflowService` before invoking `GitHubMergeService.mergePR()`.

The service uses `gh pr view` with JSON output to fetch PR state, reviews, review threads, CI status checks, and commit statuses in a single API call.

## Check Types

| Check Type               | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `ci_passing`             | All status check rollup items must be `SUCCESS`, `NEUTRAL`, or `SKIPPED` |
| `reviews_approved`       | Number of unique approving reviewers ≥ `minApprovals`                    |
| `no_requested_changes`   | No reviewer has an active `CHANGES_REQUESTED` state                      |
| `conversations_resolved` | All review threads are resolved                                          |
| `up_to_date`             | Branch is not behind the base branch (`mergeable_state !== 'BEHIND'`)    |

Each check returns a `PRCheckStatus`:

```typescript
interface PRCheckStatus {
  checkType: AutoMergeCheckType;
  passed: boolean;
  details?: string; // human-readable explanation
}
```

## Evaluation

`evaluatePR(workDir, prNumber, settings, repo?)` runs all checks in `settings.requiredChecks` and returns:

```typescript
interface MergeEligibilityResult {
  eligible: boolean; // true only if ALL checks pass
  checks: PRCheckStatus[]; // result per check
  summary: string; // human-readable verdict
  prNumber: number;
  error?: string;
}
```

PRs that are already merged or closed short-circuit immediately with `eligible: false`.

## Configuration

Settings come from `AutoMergeSettings` (resolved via `DEFAULT_AUTO_MERGE_SETTINGS`):

```typescript
interface AutoMergeSettings {
  requiredChecks: AutoMergeCheckType[];
  minApprovals: number;
  // ... other settings
}
```

Default settings require: `ci_passing`, `no_requested_changes`, `conversations_resolved`.

## Architecture

```text
MergeEligibilityService
  ├── getPRDetails()           — gh pr view (JSON: state, mergeable, checks, reviews, threads)
  ├── checkCIPassing()         — statusCheckRollup + commit-level contexts
  ├── checkReviewsApproved()   — latest review per author ≥ minApprovals
  ├── checkNoRequestedChanges() — no active CHANGES_REQUESTED
  ├── checkConversationsResolved() — all reviewThreads.isResolved
  └── checkUpToDate()          — mergeable_state !== 'BEHIND'
```

## Key Files

| File                                                    | Role                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/server/src/services/merge-eligibility-service.ts` | Service (singleton `mergeEligibilityService`)                            |
| `apps/server/src/services/git-workflow-service.ts`      | Calls `evaluatePR()` before attempting merge                             |
| `libs/types/src`                                        | `AutoMergeSettings`, `AutoMergeCheckType`, `DEFAULT_AUTO_MERGE_SETTINGS` |

## See Also

- [GitHub Merge Service](./github-merge-service) — executes the merge after eligibility passes
- [Git Workflow Service](./git-workflow-service) — orchestrates the full post-execution pipeline
- [CodeRabbit Resolver Service](./coderabbit-resolver-service) — resolves bot threads (affects `conversations_resolved` check)
