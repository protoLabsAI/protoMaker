/**
 * RemediationBudgetEnforcer — split remediation budget enforcement.
 *
 * Enforces per-class (CI / review) retry limits and a hard total cap
 * across both classes. Provides backward compatibility with the legacy
 * single remediationCycleCount field. Supports progress-aware budget
 * extension when the agent reduces the number of failing checks.
 */

import type {
  CIReactionSettings,
  RemediationBudgetCheckResult,
  RemediationBudgetInput,
  CIFailureEvidence,
} from '@protolabsai/types';
import type { Feature } from '@protolabsai/types';

/**
 * Extended result that includes the next counter values after incrementing.
 */
export interface RemediationBudgetEnforcerResult extends RemediationBudgetCheckResult {
  nextCiRemediationCount: number;
  nextReviewRemediationCount: number;
}

/**
 * Resolve the effective CI reaction settings by merging environment variable
 * overrides with the base defaults.
 */
function resolveEffectiveSettings(base: CIReactionSettings): CIReactionSettings {
  const envOverride = parseInt(process.env.REVIEW_REMEDIATION_MAX_CYCLES ?? '', 10);
  if (!isNaN(envOverride) && envOverride > 0) {
    return {
      ...base,
      maxReviewRemediationCycles: envOverride,
      // Adjust total cap to accommodate the increased review cycles
      maxTotalRemediationCycles: Math.max(
        base.maxTotalRemediationCycles,
        base.maxCiRemediationCycles + envOverride
      ),
    };
  }
  return base;
}

/**
 * Default settings with increased review remediation cycles (2 -> 3)
 * and a higher total cap to accommodate multi-test fixes.
 * Can be overridden via REVIEW_REMEDIATION_MAX_CYCLES environment variable.
 */
export const DEFAULT_CI_REACTION_SETTINGS: CIReactionSettings = resolveEffectiveSettings({
  maxCiRemediationCycles: 2,
  maxReviewRemediationCycles: 3,
  maxTotalRemediationCycles: 5,
});

/**
 * Legacy count migration result.
 */
export interface LegacyCountMigration {
  ciRemediationCount: number;
  reviewRemediationCount: number;
  remediationCycleCount: number;
}

/**
 * Result of a progress-aware budget extension check.
 */
export interface ProgressCheckResult {
  /** Whether the budget was extended due to measurable progress */
  extended: boolean;
  /** Reason for the extension (or empty string if not extended) */
  reason: string;
}

export class RemediationBudgetEnforcer {
  private settings: CIReactionSettings;

  constructor(settings: CIReactionSettings) {
    this.settings = settings;
  }

  /**
   * Check whether a remediation cycle is allowed and, if so, return the
   * incremented counters. If blocked, returns the reason and an
   * explanatory message.
   */
  checkAndIncrement(input: RemediationBudgetInput): RemediationBudgetEnforcerResult {
    const { type, settings } = input;
    let { ciRemediationCount, reviewRemediationCount } = input;

    // Backward compatibility: when split counts are both zero but legacy
    // remediationCycleCount is present and non-zero, use it as the total
    // for cap checking purposes.
    const legacyCount = input.remediationCycleCount ?? 0;
    const splitTotal = ciRemediationCount + reviewRemediationCount;
    const effectiveTotal = splitTotal === 0 && legacyCount > 0 ? legacyCount : splitTotal;

    // 1. Total cap check (checked first — it is a hard cap)
    if (effectiveTotal >= settings.maxTotalRemediationCycles) {
      return {
        allowed: false,
        message: `Total remediation budget exhausted: ${effectiveTotal}/${settings.maxTotalRemediationCycles} total cycles used.`,
        exhaustedBudget: 'total',
        nextCiRemediationCount: ciRemediationCount,
        nextReviewRemediationCount: reviewRemediationCount,
      };
    }

    // 2. Per-class limit check
    if (type === 'ci') {
      if (ciRemediationCount >= settings.maxCiRemediationCycles) {
        return {
          allowed: false,
          message: `CI remediation budget exhausted: ${ciRemediationCount}/${settings.maxCiRemediationCycles} CI cycles used.`,
          exhaustedBudget: 'ci',
          nextCiRemediationCount: ciRemediationCount,
          nextReviewRemediationCount: reviewRemediationCount,
        };
      }

      return {
        allowed: true,
        message: 'CI remediation allowed.',
        exhaustedBudget: undefined,
        nextCiRemediationCount: ciRemediationCount + 1,
        nextReviewRemediationCount: reviewRemediationCount,
      };
    }

    // type === 'review'
    if (reviewRemediationCount >= settings.maxReviewRemediationCycles) {
      return {
        allowed: false,
        message: `Review remediation budget exhausted: ${reviewRemediationCount}/${settings.maxReviewRemediationCycles} review cycles used.`,
        exhaustedBudget: 'review',
        nextCiRemediationCount: ciRemediationCount,
        nextReviewRemediationCount: reviewRemediationCount,
      };
    }

    return {
      allowed: true,
      message: 'Review remediation allowed.',
      exhaustedBudget: undefined,
      nextCiRemediationCount: ciRemediationCount,
      nextReviewRemediationCount: reviewRemediationCount + 1,
    };
  }

  /**
   * Check whether the agent is making measurable progress by comparing
   * the current number of CI failures with the previous cycle.
   * If fewer checks are failing, extend the budget by 1 cycle.
   */
  checkProgressAndExtend(
    feature: Feature,
    currentEvidences: CIFailureEvidence[]
  ): ProgressCheckResult {
    const history = feature._remediationHistory;
    if (!history || history.length === 0) {
      return { extended: false, reason: '' };
    }

    const previousEntry = history[history.length - 1];
    const previousCount = previousEntry.ciFailureCount;
    const currentCount = currentEvidences.length;

    if (currentCount < previousCount) {
      return {
        extended: true,
        reason: `${previousCount} -> ${currentCount} failing checks`,
      };
    }

    return { extended: false, reason: '' };
  }

  /**
   * Migration helper for legacy features that only have a single
   * remediationCycleCount. Splits the legacy count into CI and review
   * counters while preserving the original count for total cap checking.
   */
  static fromLegacyCount(count: number): LegacyCountMigration {
    return {
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      remediationCycleCount: count,
    };
  }
}
