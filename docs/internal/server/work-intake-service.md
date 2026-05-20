# Work Intake Service

Pull-based phase claiming. The auto-mode loop reads project documents, claims claimable phases, and materializes them into board features for execution.

## Overview

`WorkIntakeService` is the work distribution mechanism. It runs a configurable tick loop when auto-mode is active. Each tick:

1. Reads project docs from disk
2. Finds claimable phases using pure functions from `@protolabsai/utils`
3. Claims phases by writing `claimedBy` into the project doc
4. Verifies the claim survived (race condition check against any concurrent writer)
5. Creates local features from claimed phases
6. On feature completion, updates `executionStatus: 'done'` in the project doc

**Key design principle:** Phases are the coordination unit. The instance executes only what it owns.

## Architecture

```text
WorkIntakeService.tick()
  --> getProjects(projectPath)                                  // Read project docs
  --> getClaimablePhases(project, instanceId, role, tags)       // Pure function
  --> [for each claimable phase, by priority]
        --> updatePhaseClaim(projectSlug, milestoneSlug, phaseName, { claimedBy: instanceId })
        --> wait CLAIM_VERIFY_DELAY_MS (200ms)
        --> getPhase(...)                                        // Re-read
        --> holdsClaim(phase, instanceId)?
              YES --> materializeFeature()
                  --> createFeature(projectPath, feature)
              NO  --> skip
```

## Phase Lifecycle

```text
claimable
  --> claimed (claimedBy: instanceId, claimedAt: ISO)
    --> executing (executionStatus: 'running')
      --> done (executionStatus: 'done', prUrl?)
      --> failed (executionStatus: 'failed')
```

Stale claims (no activity for `claimTimeoutMs`, default 30 min) become reclaimable so work does not get stuck when an instance crashes mid-execution.

## Pure Functions (from `@protolabsai/utils`)

| Function             | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `getClaimablePhases` | Returns phases this instance can claim based on role, tags, and status |
| `holdsClaim`         | Returns true if the given instanceId owns the claim on a phase         |
| `isReclaimable`      | Returns true if a stale claim can be recovered                         |
| `materializeFeature` | Converts a `Phase` into a `Feature` record ready for execution         |
| `phasePriority`      | Numeric priority for ordering claims (milestone order × phase index)   |

All logic is pure and testable independently of the service.

## Configuration

```typescript
interface WorkIntakeConfig {
  enabled: boolean;
  tickIntervalMs: number; // Default: 30_000 (30s)
  claimTimeoutMs: number; // Default: 1_800_000 (30 min)
}
```

Configure via `configure(Partial<WorkIntakeConfig>)` before calling `start()`.

## Dependencies

The service uses dependency injection to avoid tight coupling to other services:

```typescript
interface WorkIntakeDependencies {
  events: EventEmitter;
  instanceId: string;
  role: InstanceRole;
  tags?: string[];
  getProjects: (projectPath: string) => Promise<Project[]>;
  updatePhaseClaim: (projectPath, projectSlug, milestoneSlug, phaseName, update) => Promise<void>;
  getPhase: (projectPath, projectSlug, milestoneSlug, phaseName) => Promise<Phase | null>;
  createFeature: (projectPath, feature) => Promise<{ id: string }>;
  getRunningAgentCount: () => number;
  getMaxConcurrency: () => number;
}
```

Set via `setDependencies(deps)` before calling `start()`.

## Lifecycle

```typescript
// Start tick loop (call when auto-mode starts)
workIntakeService.start(projectPath: string)

// Stop tick loop (call when auto-mode stops)
workIntakeService.stop()

// Report phase completion back to the project doc
workIntakeService.reportCompletion(
  projectPath, projectSlug, milestoneSlug, phaseName, prUrl?
)
```

The tick runs immediately on `start()`, then at `tickIntervalMs` intervals.

## Stale Claim Recovery

When `isReclaimable(phase, claimTimeoutMs)` is true (the claim is older than `claimTimeoutMs`), the phase becomes available again on the next tick. This prevents work from getting stuck when an agent crashes mid-execution.

## Concurrency Gating

Before claiming a phase, the service checks:

```typescript
if (getRunningAgentCount() >= getMaxConcurrency()) {
  // Skip this tick — already at capacity
  return;
}
```

This prevents over-claiming when the instance is already fully utilized.

## Instance Role Matching

`getClaimablePhases` uses `role` and `tags` to match phases to the executing context:

- **Frontend phases** → claimed by `frontend` role
- **Backend phases** → claimed by `backend` role
- **Full-stack phases** → any role can claim
- **Tags** — additional capability matching (e.g., `['infra', 'database']`)

When a phase has no role constraint, any role can claim it.

## Key Files

| File                                              | Role                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| `apps/server/src/services/work-intake-service.ts` | Core service — tick loop, claim protocol, completion     |
| `apps/server/src/services/work-intake.module.ts`  | Wires dependencies at startup                            |
| `libs/utils/src/work-intake.ts`                   | Pure functions: `getClaimablePhases`, `holdsClaim`, etc. |
| `libs/types/src/project.ts`                       | `Phase`, `InstanceRole`, `InstanceIdentity` types        |

## See Also

- [Project Service](./project-service) — reads and writes phase state
- [Auto Mode Service](./auto-mode-service) — executes the local features created by work intake
