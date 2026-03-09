# Work Intake Service

Pull-based phase claiming that distributes work across the Hivemind mesh — instances independently claim phases from shared project documents, then create local features to execute.

## Overview

`WorkIntakeService` is the distributed work distribution mechanism. It runs a configurable tick loop when auto-mode is active. Each tick:

1. Reads shared project docs (local Automerge replica)
2. Finds claimable phases using pure functions from `@protolabsai/utils`
3. Claims phases by atomically writing to the shared project doc
4. Verifies the claim survived Automerge merge (CRDT race condition check)
5. Creates **local** features from claimed phases
6. On feature completion, updates `executionStatus: 'done'` in the shared doc

**Key design principle:** Features never cross the wire. Phases are the coordination unit. Each instance executes only what it owns.

## Architecture

```text
WorkIntakeService.tick()
  --> getProjects(projectPath)               // Read local Automerge replica
  --> getClaimablePhases(project, instanceId, role, tags)   // Pure function
  --> [for each claimable phase, by priority]
        --> updatePhaseClaim(projectSlug, milestoneSlug, phaseName, { claimedBy: instanceId })
        --> wait CLAIM_VERIFY_DELAY_MS (200ms)
        --> getPhase(...)                     // Re-read after Automerge merge
        --> holdsClaim(phase, instanceId)?    // Did our claim win?
              YES --> materializeFeature()
                  --> createFeature(projectPath, feature)
              NO  --> skip (another instance won the race)
```

## Phase Lifecycle

```text
claimable
  --> claimed (claimedBy: instanceId, claimedAt: ISO)
    --> executing (executionStatus: 'running')
      --> done (executionStatus: 'done', prUrl?)
      --> failed (executionStatus: 'failed')
```

Stale claims (no activity for `claimTimeoutMs`, default 30 min) become reclaimable if the claiming instance is no longer alive in the peer registry or if the claim has exceeded `claimTimeoutMs`.

## Pure Functions (from `@protolabsai/utils`)

| Function             | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `getClaimablePhases` | Returns phases this instance can claim based on role, tags, and status |
| `holdsClaim`         | Returns true if the given instanceId owns the claim on a phase         |
| `isReclaimable`      | Returns true if a stale claim can be recovered by another instance     |
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
  getPeerStatus: () => Map<string, InstanceIdentity>;
}
```

Set via `setDependencies(deps)` before calling `start()`.

## Lifecycle

```typescript
// Start tick loop (call when auto-mode starts)
workIntakeService.start(projectPath: string)

// Stop tick loop (call when auto-mode stops)
workIntakeService.stop()

// Report phase completion back to the shared project doc
workIntakeService.reportCompletion(
  projectPath, projectSlug, milestoneSlug, phaseName, prUrl?
)
```

The tick runs immediately on `start()`, then at `tickIntervalMs` intervals.

## Stale Claim Recovery

When `isReclaimable(phase, peerStatus, claimTimeoutMs)` is true:

- The claiming instance is not in `peerStatus` (it went offline)
- OR the claim is older than `claimTimeoutMs`

The next available instance can re-claim the phase. This prevents work from getting stuck when an instance crashes mid-execution.

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

`getClaimablePhases` uses `role` and `tags` to match phases to instances:

- **Frontend phases** → claimed by `frontend` role instances
- **Backend phases** → claimed by `backend` role instances
- **Full-stack phases** → any instance can claim
- **Tags** — additional capability matching (e.g., `['infra', 'database']`)

When a phase has no role constraint, any instance can claim it.

## Key Files

| File                                              | Role                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| `apps/server/src/services/work-intake-service.ts` | Core service — tick loop, claim protocol, completion     |
| `apps/server/src/services/work-intake.module.ts`  | NestJS module wiring — wires dependencies at startup     |
| `libs/utils/src/work-intake-utils.ts`             | Pure functions: `getClaimablePhases`, `holdsClaim`, etc. |
| `libs/types/src/project.ts`                       | `Phase`, `InstanceRole`, `InstanceIdentity` types        |

## See Also

- [Project Service](./project-service) — reads and writes phase state in Automerge docs
- [CRDT Sync Service](./crdt-sync-service) — project change events that keep replicas in sync
- [Ava Channel Reactor](./ava-channel-reactor) — calls `WorkIntakeService.tick()` on capacity heartbeats
- [Auto Mode Service](./auto-mode-service) — executes the local features created by work intake
- [Distributed Sync](../dev/distributed-sync.md#work-intake-protocol) — full protocol spec, pure functions, instance role descriptions
