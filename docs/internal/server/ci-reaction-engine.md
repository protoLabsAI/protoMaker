# CI Reaction Engine

Automated response to CI failures and PR review feedback: budget enforcement, friction detection, and self-improvement loops.

## Overview

The CI Reaction Engine controls how many times an agent can retry failing CI checks or address PR review feedback. It enforces per-class budgets (CI vs. review) with a hard total cap, tracks recurring failure patterns via a sliding-window counter, and files System Improvement features when patterns become chronic.

**Key components:**

| Component                   | File                                                      | Responsibility                                               |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `RemediationBudgetEnforcer` | `apps/server/src/services/remediation-budget-enforcer.ts` | Enforce per-class + total retry limits                       |
| `FrictionTrackerService`    | `apps/server/src/services/friction-tracker-service.ts`    | Detect recurring failure patterns; file improvement features |
| `CIReactionSettings`        | `libs/types/src/ci-reaction.ts`                           | Configuration types for budget limits                        |

---

## Remediation Budget Enforcer

`RemediationBudgetEnforcer` prevents infinite retry loops by enforcing two kinds of limits:

1. **Per-class limits** — separate caps for CI failures and PR review cycles
2. **Total hard cap** — combined CI + review cannot exceed `maxTotalRemediationCycles`

### Budget check order

```text
checkAndIncrement(type, ciCount, reviewCount, settings)
  1. Check total cap  → ciCount + reviewCount >= maxTotalRemediationCycles → BLOCK (exhaustedBudget: 'total')
  2. Check per-class  → count >= maxCiRemediationCycles | maxReviewRemediationCycles → BLOCK (exhaustedBudget: 'ci'|'review')
  3. All checks pass  → ALLOW; return incremented counts
```

The total cap is evaluated first, so a feature that has used 2 CI + 2 review cycles (total = 4) is blocked even if neither per-class limit is reached.

### Configuration

Set in `.automaker/settings.json` under `ciReaction`:

```json
{
  "ciReaction": {
    "maxCiRemediationCycles": 2,
    "maxReviewRemediationCycles": 2,
    "maxTotalRemediationCycles": 4
  }
}
```

| Setting                      | Default | Description                             |
| ---------------------------- | ------- | --------------------------------------- |
| `maxCiRemediationCycles`     | `2`     | Max retries for CI failure remediations |
| `maxReviewRemediationCycles` | `2`     | Max retries for PR review feedback      |
| `maxTotalRemediationCycles`  | `4`     | Hard cap combining both classes         |

### Feature fields

Features track split remediation counts via two fields:

```typescript
interface Feature {
  ciRemediationCount: number; // how many CI remediations have run
  reviewRemediationCount: number; // how many review remediations have run
  remediationCycleCount?: number; // legacy: total combined count (deprecated)
}
```

`remediationCycleCount` is preserved for backward compatibility. New code should use the split counts.

### Key types

```typescript
interface RemediationBudgetInput {
  type: 'ci' | 'review';
  ciRemediationCount: number;
  reviewRemediationCount: number;
  remediationCycleCount?: number; // legacy fallback
  settings: CIReactionSettings;
}

interface RemediationBudgetCheckResult {
  allowed: boolean;
  message: string;
  exhaustedBudget?: 'ci' | 'review' | 'total';
}
```

---

## Friction Tracker Service

`FrictionTrackerService` observes failure patterns across features and files a System Improvement feature when a pattern recurs frequently enough to indicate a systemic issue.

### How it works

```text
recordFailureWithContext(pattern, context)
  → Skip excluded patterns (rate_limit, transient, unknown)
  → Evict entries older than 7 days from the sliding window
  → Increment counter for this pattern
  → If count >= 3 AND peer hasn't filed in last 24h:
      → File System Improvement feature with accumulated context
      → Mark pattern as filed for peer dedup
```

### Thresholds

| Constant               | Value      | Meaning                                                |
| ---------------------- | ---------- | ------------------------------------------------------ |
| `OCCURRENCE_THRESHOLD` | `3`        | Occurrences within the window to trigger filing        |
| `COUNTER_WINDOW_MS`    | `7 days`   | Sliding window for pattern counting                    |
| `PEER_DEDUP_WINDOW_MS` | `24 hours` | Dedup window to avoid multi-instance duplicate filings |

### Excluded patterns

These patterns are considered transient infrastructure noise and are never counted toward friction:

- `rate_limit` — API rate limits
- `transient` — network or flaky failures
- `unknown` — unclassified errors

### Context accumulation

Each call to `recordFailureWithContext()` can include diagnostic context that accumulates across occurrences and is embedded in the filed System Improvement feature:

```typescript
interface FailureContext {
  featureId?: string; // which feature triggered this failure
  conflictingFiles?: string[]; // files involved in merge conflicts
  branchName?: string; // branch where the failure occurred
}
```

### API

```typescript
class FrictionTrackerService {
  // Record a failure with optional diagnostic context
  recordFailureWithContext(pattern: string, context: FailureContext): Promise<void>;

  // Record a failure without context
  recordFailure(pattern: string): Promise<void>;

  // Handle a peer instance's friction report (for dedup)
  handlePeerReport(report: FrictionReport): void;

  // Query current in-memory state
  getCount(pattern: string): number;
  getPatterns(): Array<{ pattern: string; count: number; lastSeenMs: number }>;

  // Mark a pattern as resolved (resets counter)
  resolvePattern(pattern: string): void;

  // Check if a peer instance recently filed for this pattern
  isPeerRecentlyFiled(pattern: string): boolean;
}
```

### Multi-instance deduplication

When multiple server instances are running (see [Peer Mesh Service](./peer-mesh-service)), each instance tracks patterns independently. Before filing a System Improvement feature, the service checks whether a peer has already filed for the same pattern within the last 24 hours. If so, it skips filing to avoid duplicate features.

Peer reports are broadcast via the Peer Mesh and handled by `handlePeerReport()`.

---

## CIReactionSettings Types

Defined in `libs/types/src/ci-reaction.ts`.

```typescript
interface CIReactionSettings {
  maxCiRemediationCycles: number;
  maxReviewRemediationCycles: number;
  maxTotalRemediationCycles: number;
}

interface RemediationBudgetCheckResult {
  allowed: boolean;
  message: string;
  exhaustedBudget?: 'ci' | 'review' | 'total';
}

interface RemediationBudgetInput {
  type: 'ci' | 'review';
  ciRemediationCount: number;
  reviewRemediationCount: number;
  remediationCycleCount?: number;
  settings: CIReactionSettings;
}
```

---

## Migration: Legacy `remediationCycleCount`

Before the split budget system, a single `remediationCycleCount` tracked all retries. Existing features may have this field populated.

`RemediationBudgetEnforcer.fromLegacyCount()` converts a legacy count to the new split format, distributing the count evenly between CI and review:

```typescript
const { ciRemediationCount, reviewRemediationCount } = RemediationBudgetEnforcer.fromLegacyCount(
  feature.remediationCycleCount ?? 0
);
```

New features written by agents will always use the split counts. The legacy field is preserved in the database for backward compatibility.

---

## Related

- [DORA Metrics](./dora-metrics) — Friction patterns are one input to change failure rate
- [Auto Mode Service](./auto-mode-service) — Drives CI reaction and remediation cycles
- [Peer Mesh Service](./peer-mesh-service) — Used for friction deduplication across instances
