# Shell Safety Patterns

Critical anti-patterns that appear in code reviews. Follow these rules in every service that uses `execAsync`.

## 1. Always Validate Integers Before Shell Interpolation

TypeScript types are erased at runtime. A `number`-typed field (e.g. `prNumber`) can be `NaN`, a float, or a tainted string at runtime. Never interpolate values directly without validation:

```typescript
// ❌ WRONG — shell injection risk even for "number" typed fields
await execAsync(`gh pr view ${ctx.prNumber} --json state`);

// ✅ CORRECT — validate first with assertSafeShellInteger
import { assertSafeShellInteger } from '@protolabs-ai/platform';

assertSafeShellInteger(ctx.prNumber, 'gh pr view');
await execAsync(`gh pr view ${ctx.prNumber} --json state`);
```

The `assertSafeShellInteger` function throws immediately if the value is not a finite, non-negative integer — preventing the injection from ever reaching the shell.

## 2. Use `reviewThreads` (PRRT* IDs) — Not `comments` (PRRC* IDs)

The GitHub GraphQL API has two different node types:

- `pullRequest.comments` → returns `PRRC_` IDs (PR-level comments) — **cannot be resolved**
- `pullRequest.reviewThreads` → returns `PRRT_` IDs (inline review threads) — **what `resolveReviewThread` requires**

The `resolveReviewThread` mutation requires a `PRRT_` thread ID. Passing a `PRRC_` comment ID silently does nothing.

```typescript
// ❌ WRONG — fetches PRRC_ comment IDs, useless for resolveReviewThread
query { pullRequest(number: 123) { comments(first: 100) { nodes { id } } } }

// ✅ CORRECT — fetches PRRT_ thread IDs, works with resolveReviewThread
query { pullRequest(number: 123) { reviewThreads(first: 100) { nodes { id isResolved } } } }

// ✅ CORRECT — resolve mutation
mutation { resolveReviewThread(input: { threadId: "PRRT_kwDO..." }) { thread { id } } }
```

## 3. Handle Fire-and-Forget Promises

Non-blocking calls (fire-and-forget) must still handle rejections to avoid unhandled promise rejections that surface as process noise:

```typescript
// ❌ WRONG — unhandled rejection if save() throws
this.trajectoryStoreService.save(projectPath, featureId, trajectory);

// ✅ CORRECT — catch and log, never let it propagate
this.trajectoryStoreService
  .save(projectPath, featureId, trajectory)
  .catch((err) => logger.warn(`Trajectory save failed for ${featureId}:`, err));
```

## 4. Persistence Before In-Memory Mutation

Never mutate in-memory state before the persistence call succeeds. If the write throws, callers will see the new status but the disk has the old one:

```typescript
// ❌ WRONG — in-memory mutation before persistence
feature.status = 'done';
await featureLoader.update(projectPath, feature.id, { status: 'done' });

// ✅ CORRECT — persist first, mutate in-memory only on success
const prevStatus = feature.status;
try {
  await featureLoader.update(projectPath, feature.id, { status: 'done' });
  feature.status = 'done';
} catch (err) {
  feature.status = prevStatus; // restore on failure
  throw err;
}
```
