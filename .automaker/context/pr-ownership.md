# PR Ownership — Multi-Instance Coordination

When multiple Automaker instances (local dev, `ava-staging`, CI bot) monitor the same repository, they can all see the same open PRs. This context documents the ownership model so agents know when to act and when to defer.

## Instance Identity

Each Automaker instance has a unique `instanceId` (auto-generated UUID if not configured) and an optional `teamId`. Both are in `GlobalSettings`:

```json
{
  "instanceId": "ava-staging",
  "teamId": "proto-labs-ai",
  "prOwnershipStaleTtlHours": 24
}
```

`SettingsService.getInstanceId()` auto-generates and persists a UUID on first call.

## Ownership Watermark

Every PR created by Automaker contains a hidden HTML comment in the body:

```html
<!-- automaker:owner instance=ava-staging team=proto-labs-ai created=2026-02-25T19:00:00.000Z -->
```

This is invisible in rendered GitHub markdown but parseable by `gh pr view --json body`.

Utility functions in `apps/server/src/routes/github/utils/pr-ownership.ts`:

- `buildPROwnershipWatermark(instanceId, teamId)` — creates the comment string
- `parsePROwnershipWatermark(body)` — parses it back to `{ instanceId, teamId, createdAt }`
- `isPRStale(lastCommitAgeHours, lastActivityAgeHours, staleTtlHours)` — true when **both** ages exceed TTL

## check-pr-status Response

`POST /api/github/check-pr-status` returns an `ownership` field:

```json
{
  "ownership": {
    "instanceId": "ava-staging",
    "teamId": "proto-labs-ai",
    "isOwnedByThisInstance": true,
    "isStale": false
  }
}
```

## Nudge Rules — When to Act

| Scenario                                         | Action                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| `isOwnedByThisInstance: true`                    | Act freely (rebase, fix, comment, merge)           |
| `isOwnedByThisInstance: false`, `isStale: false` | **Skip** — another live instance owns this PR      |
| `isOwnedByThisInstance: false`, `isStale: true`  | May act — original owner appears inactive          |
| `instanceId: null`                               | PR not created by Automaker — apply project policy |

Stale = BOTH last commit AND last activity older than `prOwnershipStaleTtlHours` (default 24h).

## WorktreeRecoveryService

After every agent exits (success or failure), `WorktreeRecoveryService` checks for uncommitted changes in the worktree and runs:

```
detect uncommitted work
  → format (npx prettier --ignore-path /dev/null --write)
  → selective stage (exclude .automaker/)
  → HUSKY=0 git commit
  → git push
  → gh pr create
```

If recovery fails, the feature is marked `blocked` with a `statusChangeReason` pointing to the worktree path. The Lead Engineer's `ExecuteProcessor` escalates blocked features instead of retrying — retrying won't resolve a git/network failure.

## When Creating PRs Manually

If you create a PR directly (not through auto-mode), include the watermark manually.

**Target `dev` — not `main`.** The three-branch strategy enforces that only PRs from `staging` can reach `main`. Agent PRs always target `dev`.

```bash
INSTANCE_ID="$(cat data/settings.json | jq -r '.instanceId // "local"')"
gh pr create --base dev --title "..." --body "$(cat <<EOF
## Summary
...

<!-- automaker:owner instance=${INSTANCE_ID} team=proto-labs-ai created=$(date -u +%Y-%m-%dT%H:%M:%S.000Z) -->
EOF
)"
```
