/**
 * Maintenance check system types
 *
 * Defines the composable check module interface used by MaintenanceOrchestrator.
 * Each check module implements MaintenanceCheck and is registered with the orchestrator.
 * The orchestrator runs checks in two tiers: critical (5min) and full (6h).
 */

/** Context passed to each check module's run() method */
export interface MaintenanceCheckContext {
  /** Project paths currently known to the system */
  projectPaths: string[];
}

/** Result returned by a single check module */
export interface MaintenanceCheckResult {
  checkId: string;
  passed: boolean;
  summary: string;
  details?: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

/** Composable check module interface */
export interface MaintenanceCheck {
  /** Unique identifier for this check (e.g., 'board-health', 'resource-usage') */
  id: string;
  /** Human-readable name */
  name: string;
  /**
   * Tier this check belongs to.
   * - 'critical': runs every 5 minutes
   * - 'full': runs every 6 hours (all checks)
   */
  tier: 'critical' | 'full';
  /** Run the check and return a result */
  run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult>;
}

/** Aggregated result of a full maintenance sweep */
export interface MaintenanceSweepResult {
  sweepId: string;
  tier: 'critical' | 'full';
  startedAt: string;
  completedAt: string;
  results: MaintenanceCheckResult[];
  passed: number;
  failed: number;
}
