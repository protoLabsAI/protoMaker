/**
 * PrePushValidationService — Stub (not yet implemented)
 *
 * Runs format and typecheck validation before a git push.
 * Full implementation in M5: Pre-Push Validation.
 */

/** Configuration for pre-push validation checks */
interface PrePushValidation {
  enabled?: boolean;
  checks?: string[];
  failAction?: 'block' | 'warn';
  timeout?: number;
}

export interface CheckResult {
  check: 'format' | 'typecheck';
  passed: boolean;
  output: string;
  /** true when the check was auto-fixed and then passed on re-check */
  autoFixed?: boolean;
}

export interface ValidationResult {
  /** true when all checks passed (or the service is in warnOnly/disabled mode) */
  success: boolean;
  /** Individual check results */
  results: CheckResult[];
  /** Non-fatal messages (warnOnly mode turns failures into warnings) */
  warnings: string[];
  /** Whether validation was skipped due to disabled flag */
  skipped: boolean;
  /** Whether the run timed out */
  timedOut: boolean;
}

export class PrePushValidationService {
  async validate(_projectPath: string, _config: PrePushValidation = {}): Promise<ValidationResult> {
    throw new Error('Not implemented');
  }
}

export const prePushValidationService = new PrePushValidationService();
