# Multi-Instance PR Coordination

When multiple Automaker instances (e.g., `ava-staging`, a developer's local instance, and a CI bot) all monitor the same repository, they can all see the same open PRs. Without coordination, two instances could simultaneously nudge or attempt to fix the same PR, producing noisy comments, redundant commits, or conflicting rebase attempts.

This page documents how Automaker solves this with **instance-stamped ownership** and **stale decay**.

---

## Overview

1. When Automaker creates a PR, it embeds a hidden ownership watermark in the PR body.
2. When any instance checks a PR's status, it parses the watermark to determine who owns the PR.
3. An instance only acts on a PR that it owns **or** whose ownership has gone stale.

---

## Instance Identity

Each Automaker instance has a unique `instanceId`. This is configured in the global settings:

| Field                      | Type                              | Description                                                                                                      |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `instanceId`               | `string` (optional)               | Human-readable or UUID identifier, e.g. `"ava-staging"`. Auto-generated UUID on first startup if not configured. |
| `teamId`                   | `string` (optional)               | Org/team grouping, e.g. `"proto-labs-ai"`. Used for cross-instance visibility.                                   |
| `prOwnershipStaleTtlHours` | `number` (optional, default `24`) | How many hours before an ownership claim is considered stale.                                                    |

### Auto-Generation

If `instanceId` is not set in `settings.json`, `SettingsService.getInstanceId()` generates a UUID using `crypto.randomUUID()`, persists it to `settings.json`, and returns it. Subsequent calls return the persisted value.

---

## PR Ownership Watermark

When creating a PR, Automaker appends a hidden HTML comment to the PR body:

```html
<!-- automaker:owner instance=ava-staging team=proto-labs-ai created=2026-02-25T19:00:00.000Z -->
```

This comment is **invisible in rendered GitHub markdown** but is present in the raw PR body text, making it parseable by any Automaker instance that calls `gh pr view --json body`.

### Format

```
<!-- automaker:owner instance=<instanceId> team=<teamId> created=<ISO8601> -->
```

- `instance` — The `instanceId` of the Automaker that created the PR.
- `team` — The `teamId` of the creating instance (empty string if not configured).
- `created` — ISO 8601 UTC timestamp of when the PR was opened by Automaker.

### Utility Functions

All watermark logic lives in `apps/server/src/routes/github/utils/pr-ownership.ts`:

| Function                                                             | Description                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `buildPROwnershipWatermark(instanceId, teamId)`                      | Creates the HTML comment string to append to a PR body.                                                           |
| `parsePROwnershipWatermark(body)`                                    | Parses the HTML comment from a raw PR body, returning `{ instanceId, teamId, createdAt }` (all `null` if absent). |
| `isPRStale(lastCommitAgeHours, lastActivityAgeHours, staleTtlHours)` | Returns `true` when **both** commit age and activity age exceed the TTL.                                          |

---

## Stale Decay

Ownership expires when **both** of these conditions are true:

- The most recent commit to the PR branch is older than `prOwnershipStaleTtlHours` hours.
- The last PR activity (comments, reviews, pushes) is older than `prOwnershipStaleTtlHours` hours.

Requiring **both** conditions prevents false positives from PRs that are under active review but haven't received new commits.

**Default TTL:** 24 hours (configurable via `prOwnershipStaleTtlHours` in global settings).

---

## check-pr-status Response

The `POST /api/github/check-pr-status` endpoint now returns an `ownership` field alongside CI check results:

```json
{
  "success": true,
  "passedCount": 3,
  "failedCount": 0,
  "pendingCount": 1,
  "ownership": {
    "instanceId": "ava-staging",
    "teamId": "proto-labs-ai",
    "createdAt": "2026-02-25T19:00:00.000Z",
    "isOwnedByThisInstance": true,
    "isStale": false
  }
}
```

| Field                   | Type             | Description                                                      |
| ----------------------- | ---------------- | ---------------------------------------------------------------- |
| `instanceId`            | `string \| null` | Instance that created the PR, or `null` if not watermarked.      |
| `teamId`                | `string \| null` | Team of the creating instance.                                   |
| `createdAt`             | `string \| null` | ISO 8601 timestamp from the watermark.                           |
| `isOwnedByThisInstance` | `boolean`        | `true` when the PR's `instanceId` matches the calling instance.  |
| `isStale`               | `boolean`        | `true` when ownership is expired per `prOwnershipStaleTtlHours`. |

---

## Nudge Rules

Callers of `check-pr-status` should use the `ownership` field to decide whether to act:

| Scenario                                         | Recommended Action                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `isOwnedByThisInstance: true`                    | Act freely (rebase, fix, comment).                                     |
| `isOwnedByThisInstance: false`, `isStale: false` | Skip — another live instance owns this PR.                             |
| `isOwnedByThisInstance: false`, `isStale: true`  | May act — original owner appears inactive; rebase on stale to reclaim. |
| `instanceId: null`                               | PR not created by Automaker; decide based on project policy.           |

---

## Configuration Example

In `data/settings.json` (global settings):

```json
{
  "instanceId": "ava-staging",
  "teamId": "proto-labs-ai",
  "prOwnershipStaleTtlHours": 48
}
```

To use a shorter TTL for CI bots (faster reclaim):

```json
{
  "instanceId": "ci-bot",
  "teamId": "proto-labs-ai",
  "prOwnershipStaleTtlHours": 6
}
```
