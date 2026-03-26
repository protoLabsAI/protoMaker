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

    lease.leaseCount = Math.max(0, lease.leaseCount - 1);
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
   * Force-release all leases for the given project.
   *
   * Used by `stopAutoLoopForProject` to clean up concurrency slots when
   * auto-mode is explicitly stopped. Returns the featureIds that were released.
   */
  releaseAllForProject(projectPath: string): string[] {
    const released: string[] = [];
    for (const [featureId, lease] of this.leases) {
      if (lease.projectPath === projectPath) {
        this.leases.delete(featureId);
        released.push(featureId);
      }
    }
    return released;
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

  // ---------------------------------------------------------------------------
  // Fair-share allocation
  // ---------------------------------------------------------------------------

  /**
   * Return an atomic snapshot of running counts keyed by projectPath.
   * Iterates leases once to avoid TOCTOU races between separate
   * getRunningCountForProject calls.
   */
  getAllProjectCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const lease of this.leases.values()) {
      counts.set(lease.projectPath, (counts.get(lease.projectPath) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Return the set of distinct project paths that currently hold leases.
   */
  getActiveProjectPaths(): Set<string> {
    const paths = new Set<string>();
    for (const lease of this.leases.values()) {
      paths.add(lease.projectPath);
    }
    return paths;
  }

  /**
   * Determine how many slots are available for a given project under
   * fair-share allocation.
   *
   * Fair-share algorithm:
   *
   * 1. Each active project with pending work gets a guaranteed minimum
   *    of `minConcurrency` slots (default 1).
   * 2. After reservations are satisfied, remaining global capacity is
   *    distributed proportionally to projects that can use more.
   * 3. A project's allocation is capped by its per-project hard cap
   *    (maxConcurrency from autoModeByWorktree).
   * 4. The global ceiling (MAX_SYSTEM_CONCURRENCY) is never exceeded.
   *
   * @param projectPath - The project requesting a slot.
   * @param globalCap - MAX_SYSTEM_CONCURRENCY (absolute system ceiling).
   * @param projectReservations - Map of projectPath to { min, max } slot
   *   bounds for all projects with active auto-loops. Projects not in this
   *   map are treated as having min=1, max=globalCap.
   * @param projectsWithPendingWork - Set of projectPaths that have pending
   *   features waiting to be scheduled. Only projects with pending work
   *   compete for fair-share allocation.
   * @returns The maximum number of slots the requesting project may occupy.
   */
  calculateFairShareForProject(
    projectPath: string,
    globalCap: number,
    projectReservations: Map<string, { min: number; max: number }>,
    projectsWithPendingWork: Set<string>
  ): number {
    const projectCounts = this.getAllProjectCounts();

    // If the requesting project is not in the reservation map, use defaults
    const selfBounds = projectReservations.get(projectPath) ?? {
      min: 1,
      max: globalCap,
    };

    // Phase 1: Calculate total reserved minimums across all competing projects.
    // Only projects that are either currently running agents OR have pending work
    // compete for reservations.
    const competingProjects = new Set<string>();
    for (const pp of projectCounts.keys()) {
      competingProjects.add(pp);
    }
    for (const pp of projectsWithPendingWork) {
      competingProjects.add(pp);
    }

    let totalReserved = 0;
    for (const pp of competingProjects) {
      const bounds = projectReservations.get(pp) ?? { min: 1, max: globalCap };
      totalReserved += Math.min(bounds.min, globalCap);
    }

    // If total reservations exceed global cap, scale down proportionally.
    // This handles the edge case where more active projects exist than slots.
    let effectiveMin: number;
    if (totalReserved > globalCap && competingProjects.size > 0) {
      // Distribute slots evenly across all competing projects (floor division)
      const evenShare = Math.floor(globalCap / competingProjects.size);
      effectiveMin = Math.max(1, Math.min(evenShare, selfBounds.min));
    } else {
      effectiveMin = selfBounds.min;
    }

    // Phase 2: Calculate surplus capacity after all reservations are met.
    const surplus = Math.max(0, globalCap - totalReserved);

    // Phase 3: Distribute surplus to projects that can use more capacity.
    // Surplus is divided evenly among projects that want more.

    // Projects wanting surplus = those whose max > their reserved min
    let projectsWantingSurplus = 0;
    for (const pp of competingProjects) {
      const bounds = projectReservations.get(pp) ?? { min: 1, max: globalCap };
      if (bounds.max > bounds.min) {
        projectsWantingSurplus++;
      }
    }

    let surplusShare = 0;
    if (projectsWantingSurplus > 0 && selfBounds.max > effectiveMin) {
      surplusShare = Math.floor(surplus / projectsWantingSurplus);
    }

    // The project's fair-share allocation is its reservation + surplus share,
    // capped by its per-project hard limit
    const allocation = Math.min(effectiveMin + surplusShare, selfBounds.max);

    // Never exceed global cap
    return Math.min(allocation, globalCap);
  }

  /**
   * Check whether a project may acquire a new concurrency slot under
   * fair-share allocation rules.
   *
   * This replaces the simple `globalRunning >= MAX_SYSTEM_CONCURRENCY`
   * gate with a per-project aware check.
   *
   * @returns true if the project has room to start another agent.
   */
  canProjectAcquireSlot(
    projectPath: string,
    globalCap: number,
    projectReservations: Map<string, { min: number; max: number }>,
    projectsWithPendingWork: Set<string>,
    startingCount: number
  ): boolean {
    // Global capacity check: total running + starting across ALL projects must be below globalCap
    const globalRunning = this.size;
    if (globalRunning + startingCount >= globalCap) {
      return false;
    }

    // Per-project fair-share check
    const currentRunning = this.getRunningCountForProject(projectPath);
    const totalOccupied = currentRunning + startingCount;
    const fairShare = this.calculateFairShareForProject(
      projectPath,
      globalCap,
      projectReservations,
      projectsWithPendingWork
    );
    return totalOccupied < fairShare;
  }
}
