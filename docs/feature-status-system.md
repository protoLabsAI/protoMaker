# Feature Status System

## Canonical 6-Status Flow

Automaker uses a consolidated 6-status system for all features:

```
backlog → in_progress → review → done
             ↓           ↓
          blocked ← ← ← ┘

          (verified = Ralph terminal state)
```

### Status Definitions

| Status          | Description              | When Used                                     |
| --------------- | ------------------------ | --------------------------------------------- |
| **backlog**     | Queued, ready to start   | Initial state for new features                |
| **in_progress** | Being worked on          | Agent is actively implementing                |
| **review**      | PR created, under review | After git workflow creates PR                 |
| **blocked**     | Temporary halt           | Dependency issues, failures, or manual blocks |
| **done**        | PR merged, work complete | After PR is merged to main                    |
| **verified**    | Quality checks passed    | Ralph autonomous verification loops           |

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

**Migration is automatic** - The feature-loader normalizes statuses on read, so no manual migration is required.

## Implementation Details

### Backend (libs/types)

```typescript
import { normalizeFeatureStatus } from '@automaker/types';

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

The UI displays 6 columns (excluding pipeline steps):

1. **Backlog** - Gray
2. **In Progress** - Yellow
3. **Review** - Blue
4. **Blocked** - Red
5. **Done** - Green
6. **Verified** - Green (brighter)

CSS variables: `--status-backlog`, `--status-in-progress`, `--status-review`, `--status-blocked`, `--status-done`, `--status-success` (verified)

### Auto-Mode Selection

Auto-mode picks up features with `status === 'backlog'`:

```typescript
const isEligibleStatus = feature.status === 'backlog';
```

Features in `review`, `done`, or `verified` are not eligible for auto-execution.

## Backwards Compatibility

Legacy statuses are fully supported:

- Old feature.json files load correctly (normalized on read)
- No breaking changes for users
- System continues to work with mixed status values
- UI handles unknown statuses defensively (warns + defaults to backlog)

## Testing

Unit tests verify normalization for all 14 cases:

- 6 canonical statuses (passthrough)
- 6 legacy statuses (migration)
- Undefined status (default to backlog)
- Unknown status (warn + default to backlog)

Additionally, tests verify telemetry callback invocation for metrics.

## Benefits

1. **Single Source of Truth** - 6 canonical values, no overlapping semantics
2. **Clear Flow** - Unambiguous progression from backlog to done
3. **Defensive** - Automatic normalization prevents invalid states
4. **Backwards Compatible** - No migration required, works transparently
5. **Telemetry** - Track legacy usage for monitoring
6. **Authority Integration** - WorkItemState preserved for future integration

## Future Work

- Integrate Authority System `workItemState` with canonical statuses
- Add status transition guards in policy engine
- Implement status history tracking
- Add analytics dashboard for status flow metrics
