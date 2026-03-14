# CodeRabbit Resolver Service

Automatically resolves bot-created GitHub review threads before auto-merge, while preserving human review threads and skipping critical bot issues.

## Overview

`CodeRabbitResolverService` runs as part of the merge pipeline (called by `GitWorkflowService`) after CI passes and before merge is attempted. It uses GitHub's GraphQL API via `gh` CLI to:

1. Fetch all review threads for a PR
2. Identify threads created by **known bot accounts**
3. Skip threads with **critical severity** (require manual review)
4. **Resolve** non-critical bot threads
5. Leave all human-authored threads untouched

## Known Bot Accounts

The following login patterns are recognized as bots:

- `coderabbitai`
- `github-actions` / `github-actions[bot]`
- `dependabot` / `dependabot[bot]`
- `renovate` / `renovate[bot]`

Matching is case-insensitive and uses `includes()` — partial matches work.

## Severity Classification

Before resolving a thread, the service parses the first comment body to determine severity:

| Marker                                            | Severity     |
| ------------------------------------------------- | ------------ |
| `**Severity**: critical` or `**Severity**: high`  | `critical`   |
| `**Severity**: warning` or `**Severity**: medium` | `warning`    |
| `**Severity**: suggestion` or `**Severity**: low` | `suggestion` |
| `🚨` emoji                                        | `critical`   |
| `⚠️` emoji                                        | `warning`    |
| `💡` emoji                                        | `suggestion` |
| _(none of the above)_                             | `info`       |

**Critical threads are never auto-resolved**, even if created by a bot. They remain open for human review.

## API

### `resolveThreads(workDir, prNumber, repo?)`

Main entry point. Fetches threads via GraphQL and resolves all non-critical bot threads.

```typescript
const result = await codeRabbitResolverService.resolveThreads('/path/to/repo', 123);
// result: { success, resolvedCount, skippedCount, totalThreads, error? }
```

### `replyAndResolveThread(threadId, pullRequestId, body)`

Posts a reply comment on a thread then resolves it. Used when a reply is required before resolution.

### `getPullRequestId(workDir, prNumber, repo?)`

Returns the GraphQL node ID for a PR — needed for `addPullRequestReviewThreadReply` mutations.

## Result Type

```typescript
interface ResolveThreadsResult {
  success: boolean;
  resolvedCount: number; // threads that were resolved
  skippedCount: number; // human threads + critical bot threads skipped
  totalThreads: number; // all threads checked
  error?: string;
}
```

## GraphQL Operations

The service uses two GraphQL mutations via `gh api graphql`:

```graphql
# Fetch threads
query {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100) { ... }
    }
  }
}

# Resolve a thread
mutation {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
```

## Key Files

| File                                                      | Role                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/server/src/services/coderabbit-resolver-service.ts` | Service (singleton `codeRabbitResolverService`)             |
| `apps/server/src/services/git-workflow-service.ts`        | Calls `resolveThreads()` before merge                       |
| `libs/git-utils/src/index.ts`                             | Provides `createGitExecEnv()` for child process environment |

## See Also

- [Git Workflow Service](./git-workflow-service) — calls this service as part of the merge pipeline
- [GitHub Merge Service](./github-merge-service) — treats CodeRabbit CI status failures as transient
- [Merge Eligibility Service](./merge-eligibility-service) — `conversations_resolved` check is affected by unresolved threads
