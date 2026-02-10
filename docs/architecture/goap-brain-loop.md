# GOAP Brain Loop — Architecture & Testing Guide

## Overview

The GOAP (Goal-Oriented Action Planning) Brain Loop is an autonomous management layer that sits **above** auto-mode. It evaluates world state on a timer, selects the highest-priority unsatisfied goal based on the active role, finds the best action to address it, and executes.

```
┌────────────────────────────────────────────┐
│              GOAP Brain Loop               │  ← Management layer
│  Roles → Goals → Actions → Execute         │
├────────────────────────────────────────────┤
│              Auto-Mode                     │  ← Execution layer
│  Pick feature → Start agent → Monitor     │
├────────────────────────────────────────────┤
│              Feature Board                 │  ← Data layer
│  backlog → running → review → done         │
└────────────────────────────────────────────┘
```

**Key design constraint:** The GOAP loop never writes code. It manages the board — starting auto-mode, retrying failures, escalating stuck features. The actual implementation work happens in auto-mode agents.

---

## Architecture

### Files

| File                                                | Purpose                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `libs/types/src/goap.ts`                            | All GOAP types: `GOAPState`, `GOAPGoal`, `GOAPAction`, `GOAPRole`, `GOAPLoopStatus`, etc. |
| `apps/server/src/services/goap-loop-service.ts`     | Core service: tick loop, role selection, action selection, action execution               |
| `apps/server/src/services/world-state-evaluator.ts` | Pure function: reads features + auto-mode status → `GOAPState`                            |
| `apps/server/src/routes/goap/`                      | HTTP API: start, stop, pause, resume, status, list, set-role                              |
| `apps/ui/src/lib/http-api-client.ts`                | Client: `goap.start()`, `.stop()`, `.status()`, `.setRole()`, etc.                        |
| `apps/ui/src/hooks/queries/use-goap.ts`             | React hook: `useGOAPStatus(projectPath)` with polling                                     |
| `apps/ui/src/hooks/use-goap-events.ts`              | WebSocket hook: real-time GOAP event subscription                                         |
| `apps/ui/src/components/views/world-state-view.tsx` | Dashboard: role selector, world state, goals, actions, history                            |
| `libs/types/src/settings.ts`                        | `goapAlwaysOn` in `GlobalSettings` for boot auto-start                                    |
| `apps/server/src/index.ts`                          | Boot: orphan recovery + GOAP auto-start                                                   |

### Tick Cycle

Each tick (default 30s) runs these steps:

```
1.   evaluateWorldState() → GOAPState (15 keys)
1.5  selectRole() → GOAPRole (Guardian | Janitor | Shipper)
2.   Apply role priorities → GOAPGoal[] (4 goals with role-weighted priorities)
3.   Filter unsatisfied goals (sorted by priority desc)
4.   Filter available actions (preconditions met)
5.   selectBestAction() → greedy match (action effects → goal conditions)
6.   executeAction() → switch on action.id
7.   Record result, emit events, schedule next tick
8.   Auto-pause if consecutiveErrors >= maxConsecutiveErrors (default 5)
```

### World State (15 keys)

Computed by `world-state-evaluator.ts`:

| Key                       | Type    | Source                                         |
| ------------------------- | ------- | ---------------------------------------------- |
| `backlog_count`           | number  | `features.filter(f => f.status === 'backlog')` |
| `in_progress_count`       | number  | `features.filter(f => f.status === 'running')` |
| `review_count`            | number  | `features.filter(f => f.status === 'review')`  |
| `done_count`              | number  | `features.filter(f => f.status === 'done')`    |
| `failed_count`            | number  | `features.filter(f => f.status === 'failed')`  |
| `total_features`          | number  | `features.length`                              |
| `agents_running`          | number  | auto-mode running count                        |
| `agents_available`        | number  | `maxConcurrency - agents_running`              |
| `auto_mode_running`       | boolean | auto-mode loop status                          |
| `has_backlog_work`        | boolean | unblocked backlog > 0                          |
| `unblocked_backlog_count` | number  | backlog with deps satisfied                    |
| `has_failed_features`     | boolean | failed count > 0                               |
| `stale_feature_count`     | number  | running > 2 hours                              |
| `has_stale_features`      | boolean | stale count > 0                                |
| `is_idle`                 | boolean | 0 agents running AND 0 backlog                 |

### Roles

Three roles with different goal priority weightings:

| Role         | Activation Condition          | Priority     | Focus                           |
| ------------ | ----------------------------- | ------------ | ------------------------------- |
| **Guardian** | `failed_count >= 2`           | 20 (highest) | Failure recovery, system health |
| **Janitor**  | `stale_feature_count >= 2`    | 10           | Board hygiene, stale cleanup    |
| **Shipper**  | _(fallback — always matches)_ | 0            | Push features through pipeline  |

Role selection order:

1. **Manual override** — if `roleOverride` is set, use that role
2. **Auto-rotate** — check roles by `activationPriority` desc, first whose conditions match wins
3. **Fallback** — Shipper (no activation conditions)

### Goal Priority by Role

| Goal               | Shipper | Janitor | Guardian |
| ------------------ | ------- | ------- | -------- |
| `keep_shipping`    | **10**  | 3       | 5        |
| `recover_failures` | 9       | 8       | **10**   |
| `maintain_health`  | 5       | **10**  | 9        |
| `stay_productive`  | 3       | 7       | 5        |

### Actions (4 POC actions)

| Action                   | Preconditions                                      | Effects                     | Cost |
| ------------------------ | -------------------------------------------------- | --------------------------- | ---- |
| `start_auto_mode`        | `has_backlog_work=true`, `auto_mode_running=false` | `auto_mode_running=true`    | 1    |
| `retry_failed_feature`   | `has_failed_features=true`                         | `has_failed_features=false` | 3    |
| `escalate_stuck_feature` | `has_stale_features=true`                          | `has_stale_features=false`  | 5    |
| `log_idle`               | `is_idle=true`                                     | _(none)_                    | 0    |

### Boot Sequence

On server start (`apps/server/src/index.ts`):

1. **Orphan recovery** — Features stuck in `running` status with no agent are reset to `backlog`
2. **Auto-mode auto-start** — If `autoModeAlwaysOn.enabled`, start auto-mode for configured projects
3. **GOAP auto-start** — If `goapAlwaysOn.enabled`, start GOAP loops for configured projects

### API Routes

All routes are `POST` under `/api/goap/`:

| Route       | Body                                            | Description                              |
| ----------- | ----------------------------------------------- | ---------------------------------------- |
| `/start`    | `{ projectPath, branchName?, tickIntervalMs? }` | Start GOAP loop                          |
| `/stop`     | `{ projectPath }`                               | Stop GOAP loop                           |
| `/pause`    | `{ projectPath }`                               | Pause (keep state)                       |
| `/resume`   | `{ projectPath }`                               | Resume from pause                        |
| `/status`   | `{ projectPath }`                               | Get full GOAPLoopStatus                  |
| `/list`     | `{}`                                            | List all running loops                   |
| `/set-role` | `{ projectPath, roleId }`                       | Set manual role override (null to clear) |

### WebSocket Events

| Event                      | Payload                            | When             |
| -------------------------- | ---------------------------------- | ---------------- |
| `goap:started`             | `{ projectPath, status }`          | Loop started     |
| `goap:stopped`             | `{ projectPath, status }`          | Loop stopped     |
| `goap:paused`              | `{ projectPath, reason?, status }` | Loop paused      |
| `goap:resumed`             | `{ projectPath, status }`          | Loop resumed     |
| `goap:tick`                | `{ projectPath, status }`          | After each tick  |
| `goap:world_state_updated` | `{ projectPath, snapshot }`        | State evaluated  |
| `goap:action_executed`     | `{ projectPath, result }`          | Action succeeded |
| `goap:error`               | `{ projectPath, error }`           | Tick-level error |

---

## Current Test Coverage

### Unit Tests (`goap-loop-service.test.ts`) — 15 tests

| Area                                    | Tests | Status |
| --------------------------------------- | ----- | ------ |
| Start/stop lifecycle                    | 2     | Pass   |
| Pause/resume                            | 1     | Pass   |
| List running loops                      | 1     | Pass   |
| Action: start_auto_mode                 | 1     | Pass   |
| Action: retry_failed_feature            | 1     | Pass   |
| Action: log_idle (idle state)           | 1     | Pass   |
| Action: start_auto_mode already running | 1     | Pass   |
| Action: escalate_stuck_feature          | 1     | Pass   |
| goap:tick event emission                | 1     | Pass   |
| Auto-pause on max errors                | 1     | Pass   |
| Error reset on success                  | 1     | Pass   |
| Action history trimming                 | 1     | Pass   |

### What's NOT Tested

| Gap                       | Risk                                                      | Priority     |
| ------------------------- | --------------------------------------------------------- | ------------ |
| **Role selection logic**  | Roles could be wrong, goal priorities misapplied          | HIGH         |
| **Role auto-rotation**    | Guardian/Janitor may not activate when expected           | HIGH         |
| **Manual role override**  | `setRoleOverride()` could break                           | MEDIUM       |
| **Role in status output** | `activeRole` might not appear in `toStatus()`             | MEDIUM       |
| **World state evaluator** | 15 keys computed from features — no unit tests            | HIGH         |
| **API routes**            | `/set-role` has no test, others have no integration tests | MEDIUM       |
| **Boot auto-start**       | Orphan recovery + GOAP auto-start untested                | LOW          |
| **Dashboard UI**          | Role selector, goals panel, real-time updates             | LOW (manual) |
| **E2E: full loop cycle**  | Start → tick → action → verify board state                | HIGH         |

---

## E2E Testing Strategy

### Layer 1: Unit Tests (fast, isolated)

**Target:** `goap-loop-service.test.ts`

New tests needed:

```
describe('role selection')
  ✓ should select Guardian when failed_count >= 2
  ✓ should select Janitor when stale_feature_count >= 2
  ✓ should select Shipper as fallback when no conditions match
  ✓ should prefer Guardian over Janitor (higher activationPriority)
  ✓ should respect manual override via setRoleOverride()
  ✓ should clear override when setRoleOverride(null) called
  ✓ should include activeRole in status output
  ✓ should show selectedBy='manual' when override is active
  ✓ should show selectedBy='auto' during auto-rotation

describe('role-weighted goals')
  ✓ should use Shipper priorities when Shipper is active
  ✓ should use Guardian priorities when Guardian is active
  ✓ should select recover_failures action first under Guardian role
```

**Target:** New `world-state-evaluator.test.ts`

```
describe('evaluateWorldState')
  ✓ should count features by status correctly
  ✓ should compute has_backlog_work based on unblocked count
  ✓ should identify stale features (> 2 hours running)
  ✓ should set is_idle when no agents and no backlog
  ✓ should handle empty feature list gracefully
  ✓ should compute failed_count and stale_feature_count
```

### Layer 2: Integration Tests (service + real data)

**Target:** New `goap-integration.test.ts`

```
describe('GOAP full tick cycle')
  ✓ start loop → tick executes → action applied → board state changes
  ✓ failed features trigger Guardian → retry action resets to backlog
  ✓ stale features trigger Janitor → escalate action sets architectural
  ✓ role auto-rotates between ticks as world state changes
  ✓ multiple ticks in sequence — action history accumulates correctly
```

### Layer 3: API Route Tests

**Target:** Extend existing route test patterns or new `goap-routes.test.ts`

```
describe('GOAP API routes')
  ✓ POST /api/goap/start → 200, loop appears in list
  ✓ POST /api/goap/status → returns GOAPLoopStatus with activeRole
  ✓ POST /api/goap/set-role → sets override, status reflects manual
  ✓ POST /api/goap/set-role { roleId: null } → clears override
  ✓ POST /api/goap/stop → 200, loop removed from list
  ✓ POST /api/goap/start on non-existent project → 409
```

### Layer 4: E2E (Playwright, optional)

```
describe('World State Dashboard')
  ✓ navigate to /world-state → shows dashboard
  ✓ click Start → loop starts, status shows Running
  ✓ role selector shows active role highlighted
  ✓ click Guardian button → manual override set
  ✓ click Auto → override cleared
  ✓ goals panel shows role-weighted priorities
  ✓ action history populates after ticks
```

---

## Recommended Test Execution Order

1. **World state evaluator unit tests** — pure function, easy to test, high value
2. **Role selection unit tests** — add to existing `goap-loop-service.test.ts`
3. **Role-weighted goal unit tests** — verify priorities flow through correctly
4. **API route tests** — `/set-role` + status response shape
5. **Integration: multi-tick cycle** — full loop with mock services
6. **E2E: dashboard** — last, depends on all above being solid

---

## Configuration Reference

### `goapAlwaysOn` (Global Settings)

```typescript
{
  goapAlwaysOn: {
    enabled: true,
    projects: [
      {
        projectPath: "/path/to/automaker",
        branchName: null,       // null = main worktree
        tickIntervalMs: 30000   // optional, default 30s
      }
    ]
  }
}
```

### `GOAPLoopConfig`

```typescript
{
  projectPath: string;
  branchName: string | null; // null = main
  tickIntervalMs: number; // default 30000
  maxConsecutiveErrors: number; // default 5, auto-pauses on breach
  enabled: boolean;
  maxActionHistorySize: number; // default 100, ring buffer
}
```
