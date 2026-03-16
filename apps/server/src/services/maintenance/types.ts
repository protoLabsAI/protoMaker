/**
 * Shared types for the MaintenanceCheck module system.
 *
 * Each check implements the MaintenanceCheck interface and produces
 * MaintenanceIssue records that can be auto-fixed or surfaced to operators.
 */

/** Severity levels for maintenance issues. */
export type MaintenanceIssueSeverity = 'info' | 'warning' | 'critical';

/**
 * A single issue detected by a maintenance check.
 */
export interface MaintenanceIssue {
  /** Identifier of the check that produced this issue. */
  checkId: string;
  /** Severity of the issue. */
  severity: MaintenanceIssueSeverity;
  /** Feature ID associated with the issue, if applicable. */
  featureId?: string;
  /** Human-readable description of the issue. */
  message: string;
  /** Whether this issue can be automatically fixed. */
  autoFixable: boolean;
  /** Description of the fix that will be applied. */
  fixDescription?: string;
  /** Additional context data for diagnostics or fix operations. */
  context?: Record<string, unknown>;
}

/**
 * Interface that all MaintenanceCheck implementations must satisfy.
 *
 * Usage:
 * ```typescript
 * class MyCheck implements MaintenanceCheck {
 *   readonly id = 'my-check';
 *
 *   async run(projectPath: string): Promise<MaintenanceIssue[]> {
 *     // detect issues
 *     return [];
 *   }
 *
 *   async fix(projectPath: string, issue: MaintenanceIssue): Promise<void> {
 *     // apply auto-fix
 *   }
 * }
 * ```
 */
export interface MaintenanceCheck {
  /** Unique identifier for this check (e.g. 'stuck-feature', 'orphaned-worktree'). */
  readonly id: string;

  /**
   * Run the check against the given project and return any issues found.
   * Should not throw — catch errors internally and return an empty array or
   * a single issue with the error message.
   */
  run(projectPath: string): Promise<MaintenanceIssue[]>;

  /**
   * Apply an automatic fix for the given issue.
   * Only called when issue.autoFixable is true.
   * Implementations that have no auto-fix should omit this method.
   */
  fix?(projectPath: string, issue: MaintenanceIssue): Promise<void>;
}
