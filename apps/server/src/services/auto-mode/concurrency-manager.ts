/**
 * ConcurrencyManager — lease-based running-feature tracking
 *
 * Tracks which features are currently executing and provides per-project /
 * per-worktree counts used by the auto-loop capacity checks.
 *
 * Key design:
 * - Each feature execution acquires a `RunningFeatureLease`.
 * - `leaseCount` supports nested acquisition: when code paths such as
 *   `resumeInterruptedFeatures → resumeFeature → executeFeature` call
 *   `acquire()` for the same featureId that is already running, the lease
 *   count is incremented rather than throwing a false-positive "already
 *   running" error.  The caller should check the return value of `acquire()`
 *   to decide whether to actually begin execution.
 * - `release()` decrements the count and removes the lease only when it
 *   reaches zero, so a feature is not evicted until the outermost caller
 *   has finished.
 */

import type { RunningFeatureLease } from '@protolabsai/types';

export class ConcurrencyManager {
  private readonly leases = new Map<string, RunningFeatureLease>();

  // ---------------------------------------------------------------------------
  // Lease lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Acquire (or re-acquire) a lease for the given feature.
   *
   * @returns `true`  — this is a **new** acquisition; the caller should begin
   *                    executing the feature.
   * @returns `false` — the feature was **already running**; the caller should
   *                    return gracefully without starting a second execution.
   *                    The internal `leaseCount` has been incremented.
   */
  acquire(
    featureId: string,
    projectPath: string,
    worktreePath: string | null,
    branchName: string | null
  ): boolean {
    const existing = this.leases.get(featureId);
    if (existing) {
      existing.leaseCount++;
      return false;
    }

    this.leases.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      leaseCount: 1,
      startTime: Date.now(),
    });
    return true;
  }

  /**
   * Update the branch name after it has been resolved from the feature file.
   * Silently ignored if no lease exists for the given featureId.
   */
  updateBranchName(featureId: string, branchName: string | null): void {
    const lease = this.leases.get(featureId);
    if (lease) {
      lease.branchName = branchName;
    }
  }

  /**
   * Release a lease for the given feature.
   *
   * Decrements `leaseCount`.  The lease is removed from the internal map only
   * when the count reaches zero (i.e. the outermost caller has finished).
   *
   * @returns `true`  — lease was fully released and removed.
   * @returns `false` — leaseCount was decremented but the lease still exists
   *                    (another caller is holding a reference).
   */
  release(featureId: string): boolean {
    const lease = this.leases.get(featureId);
    if (!lease) return false;

    lease.leaseCount--;
    if (lease.leaseCount <= 0) {
      this.leases.delete(featureId);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Returns whether a lease exists for the given featureId. */
  has(featureId: string): boolean {
    return this.leases.has(featureId);
  }

  /** Returns the lease for the given featureId, or `undefined`. */
  get(featureId: string): RunningFeatureLease | undefined {
    return this.leases.get(featureId);
  }

  /** Returns the total number of active leases. */
  get size(): number {
    return this.leases.size;
  }

  /**
   * Count the number of features currently running in the given project.
   * Each active lease (regardless of `leaseCount`) counts as one running
   * feature for capacity purposes.
   */
  getRunningCountForProject(projectPath: string): number {
    let count = 0;
    for (const lease of this.leases.values()) {
      if (lease.projectPath === projectPath) {
        count++;
      }
    }
    return count;
  }

  /**
   * Release all leases older than `maxAgeMs` milliseconds.
   *
   * Returns the featureIds of leases that were forcefully released.
   * This is a defense-in-depth mechanism: if an agent exits without
   * releasing its lease (crash, OOM, etc.), the health sweep can
   * reclaim the orphaned concurrency slot.
   */
  releaseStaleLeases(maxAgeMs: number): string[] {
    const now = Date.now();
    const released: string[] = [];

    for (const [featureId, lease] of this.leases) {
      if (now - lease.startTime > maxAgeMs) {
        this.leases.delete(featureId);
        released.push(featureId);
      }
    }

    return released;
  }

  /**
   * Count the number of features currently running in a specific worktree.
   *
   * - When `branchName` is `null` (main worktree / auto-loop context): counts
   *   ALL running features for the project.
   * - Otherwise: counts only features whose `branchName` exactly matches.
   */
  getRunningCountForWorktree(projectPath: string, branchName: string | null): number {
    let count = 0;
    for (const lease of this.leases.values()) {
      if (lease.projectPath !== projectPath) continue;

      if (branchName === null) {
        // Main worktree context — count everything in the project
        count++;
      } else {
        // Worktree context — match the exact branch
        if ((lease.branchName ?? null) === branchName) {
          count++;
        }
      }
    }
    return count;
  }
}
