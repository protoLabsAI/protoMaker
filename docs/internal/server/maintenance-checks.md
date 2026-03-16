# Create a New Maintenance Check

This page shows you how to add a new maintenance check module to the MaintenanceOrchestrator. After reading it, you will know how to implement the check interface, register it, and assign it to the correct tier.

## Prerequisites

- Familiarity with the maintenance task system (see [Ops Control Plane](./ops-control-plane.md))
- Access to `apps/server/src/services/maintenance-tasks.ts`

## Implement a Check Handler

Each maintenance check is a function registered as a flow handler with the `AutomationService`. The handler receives no arguments and returns void. It emits events through the event bus for reporting.

```typescript
// In maintenance-tasks.ts, add a new handler function:

async function checkOrphanedBranches(
  events: EventEmitter,
  projectPath: string
): Promise<{ issuesFound: number; fixesApplied: number }> {
  const startTime = Date.now();
  let issuesFound = 0;
  let fixesApplied = 0;

  try {
    // 1. Detect the issue
    const orphanedBranches = await findOrphanedBranches(projectPath);
    issuesFound = orphanedBranches.length;

    // 2. Auto-fix if possible
    for (const branch of orphanedBranches) {
      try {
        await deleteMergedBranch(branch);
        fixesApplied++;
      } catch (err) {
        logger.warn(`Failed to delete orphaned branch ${branch}:`, err);
      }
    }

    // 3. Report results
    events.emit('maintenance:check-completed' as EventType, {
      check: 'orphaned-branches',
      issuesFound,
      fixesApplied,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    logger.error('Orphaned branch check failed:', err);
    events.emit('maintenance:check-failed' as EventType, {
      check: 'orphaned-branches',
      error: (err as Error).message,
      durationMs: Date.now() - startTime,
    });
  }

  return { issuesFound, fixesApplied };
}
```

## Register the Check

Register your check handler inside `registerMaintenanceFlows()`. This function is called during server startup and creates `FlowFactory` records that the `AutomationService` manages.

```typescript
export function registerMaintenanceFlows(
  automationService: AutomationService,
  events: EventEmitter
  // ... other dependencies
): void {
  // Existing checks...

  // Add your new check:
  automationService.registerFlow({
    id: 'maintenance-orphaned-branches',
    name: 'Orphaned Branch Cleanup',
    description: 'Detects and removes local branches whose remote has been deleted',
    category: 'maintenance',
    handler: async () => {
      await checkOrphanedBranches(events, projectPath);
    },
  });
}
```

## Assign the Check to a Tier

The tier determines how frequently the check runs:

| Tier       | Interval        | Use When                                                                                                   |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `critical` | Every 5 minutes | The issue causes immediate user impact if left undetected (stuck features, data corruption, failed merges) |
| `full`     | Every 6 hours   | The issue is a housekeeping concern that can wait (orphaned worktrees, stale branches, disk usage)         |

To add your check to the critical sweep, call it from the critical sweep handler:

```typescript
// Inside the critical sweep flow handler:
const results = await Promise.allSettled([
  checkDataIntegrity(events, projectPath),
  checkStaleFeatures(events, featureLoader, autoModeService, projectPath),
  checkAutoMergeEligible(events, featureLoader, projectPath, settingsService),
  checkRunnerHealth(events),
  checkOrphanedBranches(events, projectPath), // <-- Add here for critical tier
]);
```

For the full sweep, add it to the full sweep handler instead.

## Design the Auto-Fix

Not all checks should auto-fix. Follow these guidelines:

**Auto-fix is appropriate when:**

- The fix is deterministic and reversible (deleting a merged branch can be re-created).
- The fix does not change feature state in a way that could lose work.
- The fix has been observed manually enough times that the pattern is well-understood.

**Auto-fix is inappropriate when:**

- The root cause is ambiguous (a stuck feature might be waiting for user input).
- The fix involves modifying code or feature content.
- The fix could cause data loss if the diagnosis is wrong.

When auto-fix is inappropriate, the check should still detect the issue, report it via events, and let an operator decide the next step.

## Emit Structured Events

Every check should emit events so the Ops Dashboard and notification system can react:

```typescript
// On success with findings:
events.emit('maintenance:check-completed' as EventType, {
  check: 'your-check-name',
  issuesFound: 3,
  fixesApplied: 2,
  durationMs: 150,
});

// On failure:
events.emit('maintenance:check-failed' as EventType, {
  check: 'your-check-name',
  error: 'Connection to GitHub API failed',
  durationMs: 5000,
});
```

These events are consumed by:

- **Ops Dashboard** -- Real-time display in the Maintenance tab.
- **OpsTracingService** -- Structured traces sent to Langfuse when configured.
- **EventHistoryService** -- Persistent storage for audit trail.

## Test Your Check

Write a unit test that verifies:

1. The check detects the issue when the condition is present.
2. The check returns zero issues when the condition is absent.
3. The auto-fix applies correctly when issues are found.
4. The check handles errors gracefully (does not throw, emits failure event).

```typescript
describe('checkOrphanedBranches', () => {
  it('detects branches with no remote tracking', async () => {
    // Set up mock git state with orphaned branches
    const events = createMockEventEmitter();
    const result = await checkOrphanedBranches(events, '/test/project');

    expect(result.issuesFound).toBe(2);
    expect(result.fixesApplied).toBe(2);
  });

  it('returns zero issues when all branches have remotes', async () => {
    const events = createMockEventEmitter();
    const result = await checkOrphanedBranches(events, '/test/clean-project');

    expect(result.issuesFound).toBe(0);
    expect(result.fixesApplied).toBe(0);
  });
});
```

## Key Files

| File                                             | Role                                 |
| ------------------------------------------------ | ------------------------------------ |
| `apps/server/src/services/maintenance-tasks.ts`  | All maintenance check handlers       |
| `apps/server/src/services/automation-service.ts` | Flow registration and execution      |
| `apps/server/src/services/scheduler.module.ts`   | Wiring: connects sweeps to scheduler |

## Next Steps

- **[Timer Registry](./timer-registry.md)** -- Register a standalone timer outside the maintenance system
- **[Ops Control Plane](./ops-control-plane.md)** -- Understand the full operational architecture
