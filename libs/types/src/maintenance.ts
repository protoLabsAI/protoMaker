/**
 * Maintenance system types
 *
 * Defines the composable check module interface and result types
 * used by the MaintenanceOrchestrator.
 */

/** Execution tier for maintenance checks */
export type MaintenanceTier = 'critical' | 'full';

/** Outcome of a single check run */
export type MaintenanceCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/** Context passed to each check when the orchestrator runs a sweep */
export interface MaintenanceContext {
  /** Which tier triggered this sweep */
  tier: MaintenanceTier;
  /** ISO timestamp when the sweep started */
  startedAt: string;
}

/** Result returned by a single check module */
export interface MaintenanceCheckResult {
  /** Unique identifier matching the check that produced this result */
  checkId: string;
  /** Outcome of the check */
  status: MaintenanceCheckStatus;
  /** Human-readable summary */
  message?: string;
  /** Wall-clock time the check took to run */
  durationMs: number;
  /** Arbitrary structured data for debugging / reporting */
  details?: Record<string, unknown>;
}

/**
 * A composable maintenance check module.
 *
 * Implement this interface and register via
 * `MaintenanceOrchestrator.registerCheck()` to include the check in
 * scheduled sweeps.
 */
export interface MaintenanceCheck {
  /** Unique identifier used in results and logging */
  id: string;
  /** Human-readable display name */
  name: string;
  /**
   * Which tier(s) this check participates in.
   * - `'critical'` — runs every 5 minutes
   * - `'full'` — runs every 6 hours (includes critical)
   * Pass an array to participate in multiple tiers.
   */
  tier: MaintenanceTier | MaintenanceTier[];
  /** Execute the check and return a result */
  run(context: MaintenanceContext): Promise<MaintenanceCheckResult>;
}

/** Aggregated result of a full orchestrator sweep */
export interface MaintenanceSweepResult {
  /** Which tier was swept */
  tier: MaintenanceTier;
  /** ISO timestamp when the sweep started */
  startedAt: string;
  /** ISO timestamp when the sweep completed */
  completedAt: string;
  /** Total elapsed wall-clock time */
  durationMs: number;
  /** Number of checks that were executed */
  checksRun: number;
  /** Number of checks that returned status `'pass'` */
  checksPassed: number;
  /** Number of checks that returned status `'fail'` */
  checksFailed: number;
  /** Number of checks that returned status `'warn'` */
  checksWarned: number;
  /** Number of checks that were skipped */
  checksSkipped: number;
  /** Per-check results in execution order */
  results: MaintenanceCheckResult[];
}
