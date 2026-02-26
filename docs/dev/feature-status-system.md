# Feature Status System

## Canonical 5-Status Flow

protoLabs uses a consolidated 5-status system for all features:

```
backlog → in_progress → review → done
             ↓           ↓
          blocked ← ← ← ┘
```

### Status Definitions

| Status          | Description              | When Used                                     |
| --------------- | ------------------------ | --------------------------------------------- |
| **backlog**     | Queued, ready to start   | Initial state for new features                |
| **in_progress** | Being worked on          | Agent is actively implementing                |
| **review**      | PR created, under review | After git workflow creates PR                 |
| **blocked**     | Temporary halt           | Dependency issues, failures, or manual blocks |
| **done**        | PR merged, work complete | After PR is merged to main                    |

### Legacy Status Migration

The system automatically normalizes legacy status values:

| Legacy Status      | Canonical Status |
| ------------------ | ---------------- |
| `pending`          | `backlog`        |
| `ready`            | `backlog`        |
| `running`          | `in_progress`    |
| `completed`        | `done`           |
| `waiting_approval` | `done`           |
| `failed`           | `blocked`        |
| `verified`         | `done`           |

**Migration is automatic** - The feature-loader normalizes statuses on read, so no manual migration is required.

## Implementation Details

### Backend (libs/types)

```typescript
import { normalizeFeatureStatus } from '@protolabs-ai/types';

// Defensive normalization
const status = normalizeFeatureStatus(feature.status, (from, to) => {
  console.log(`Normalizing: ${from} → ${to}`);
});
```

The `normalizeFeatureStatus()` function:

- Maps legacy values to canonical values
- Returns canonical values unchanged (fast path)
- Defaults to `backlog` for undefined/unknown values
- Supports telemetry callback for tracking migrations

### Feature Loader

The `FeatureLoader` service automatically normalizes all features on read:

```typescript
// In getAll() and get()
return this.normalizeFeature(feature);
```

This ensures all features use canonical statuses throughout the system.

### UI Columns

The UI displays 5 columns (excluding pipeline steps):

1. **Backlog** - Gray
2. **In Progress** - Yellow
3. **Review** - Blue
4. **Blocked** - Red
5. **Done** - Green

CSS variables: `--status-backlog`, `--status-in-progress`, `--status-review`, `--status-blocked`, `--status-done`

### Auto-Mode Selection

Auto-mode picks up features with `status === 'backlog'`:

```typescript
const isEligibleStatus = feature.status === 'backlog';
```

Features in `review` or `done` are not eligible for auto-execution.

### Foundation Dependencies

Features marked with `isFoundation: true` enforce stricter dependency satisfaction. When a feature depends on a foundation feature, it will **not** start until the foundation reaches `done` (PR merged to main). The default behavior — where `review` status satisfies a dependency — is bypassed for foundation deps.

This prevents the "18-PR cascade problem" where multiple agents scaffold the same package directory because they all branch from `origin/main` before the scaffold PR is merged.

```typescript
// Foundation dep in 'review' → NOT satisfied (must be 'done')
// Normal dep in 'review' → satisfied (work is complete, PR under review)
```

**When is `isFoundation` set automatically?**

- Phase 1 of each milestone in project orchestration gets `isFoundation: true`
- Can be set manually via MCP `create_feature` / `update_feature` tools

**Statuses that satisfy a foundation dependency:** `done`, `completed`
**Statuses that satisfy a normal dependency:** `done`, `completed`, `review`

## Backwards Compatibility

Legacy statuses are fully supported:

- Old feature.json files load correctly (normalized on read)
- No breaking changes for users
- System continues to work with mixed status values
- UI handles unknown statuses defensively (warns + defaults to backlog)

## Testing

Unit tests verify normalization for all cases:

- 5 canonical statuses (passthrough)
- Legacy statuses (migration)
- Undefined status (default to backlog)
- Unknown status (warn + default to backlog)

Additionally, tests verify telemetry callback invocation for metrics.

## Benefits

1. **Single Source of Truth** - 5 canonical values, no overlapping semantics
2. **Clear Flow** - Unambiguous progression from backlog to done
3. **Defensive** - Automatic normalization prevents invalid states
4. **Backwards Compatible** - No migration required, works transparently
5. **Telemetry** - Track legacy usage for monitoring
6. **Authority Integration** - WorkItemState preserved for future integration

## Git Workflow Error Field

Features carry an optional `gitWorkflowError` field that captures git operation failures without changing the feature status:

```typescript
interface Feature {
  gitWorkflowError?: {
    message: string; // Error description
    timestamp: string; // ISO 8601 when the error occurred
  };
}
```

When a git workflow step (commit, push, PR creation) fails, the error is persisted to `feature.json`. The feature status remains unchanged. This makes git failures visible in the UI without disrupting the state machine.

## Status Change Events

`AutoModeService.updateFeatureStatus()` emits events on every status transition:

| Event                    | When                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `feature:status-changed` | Every status transition (carries `previousStatus` and `newStatus`) |
| `feature:completed`      | Feature reaches `done`                                             |
| `feature:error`          | Feature reaches `failed` or `blocked`                              |

These events drive downstream integrations: Langfuse scoring, ceremony triggers, UI real-time updates.

## Drift Detection & Auto-Reconciliation

Board consistency drift occurs when a feature's status doesn't automatically update after its PR merges — most commonly leaving features stuck in `blocked` or `review`. Three mechanisms work together to prevent and correct this:

### Layer 1 — Auto-Mode Poll (fastest)

Every time auto-mode polls for pending work, `loadPendingFeatures()` fetches recently merged PRs alongside open PRs. Any `blocked` or `review` feature whose branch has a merged PR is immediately transitioned to `done` before dependency evaluation runs. This means drift is corrected within seconds whenever auto-mode is active.

### Layer 2 — GitHub Webhook (real-time)

`POST /webhooks/github` handles `pull_request` closed events from GitHub. When a PR is merged, the handler looks up the feature by branch name and transitions it to `done`, emitting a `feature:pr-merged` event for UI notification.

The endpoint is **enabled by default** and protected by HMAC signature verification when `webhookSecrets.github` is configured in credentials. To explicitly disable it, set `githubWebhook.enabled: false` in global settings.

To configure the webhook in GitHub:

1. Go to **Settings → Webhooks → Add webhook**
2. Set payload URL to `https://api.protolabs.studio/webhooks/github`
3. Content type: `application/json`
4. Secret: value from `credentials.json > webhookSecrets.github`
5. Events: **Pull requests** + **Pull request reviews**

### Layer 3 — Periodic Drift Scan (catch-all)

`GitHubStateChecker` runs every 5 minutes and scans all `review`, `in_progress`, and `blocked` features. For each, it finds the associated PR via `gh pr list` and emits a `pr-merged-status-stale` drift event if the PR is already merged. `ReconciliationService` handles that drift by calling `featureLoader.update(..., { status: 'done' })`.

The drift check also detects and emits events for: CI failures, changes requested, approved-but-not-merged, and stale PRs (>7 days inactive).

### Maximum Drift Window

| Scenario                                | Maximum correction delay  |
| --------------------------------------- | ------------------------- |
| Auto-mode running, PR merges            | Seconds (next poll cycle) |
| Webhook configured + GitHub sends event | < 5 seconds               |
| Webhook not configured, auto-mode idle  | 5 minutes (drift scan)    |

## Future Work

- Integrate Authority System `workItemState` with canonical statuses
- Add status transition guards in policy engine
- Add analytics dashboard for status flow metrics
