/**
 * RemediationBudgetEnforcer — split remediation budget enforcement.
 *
 * Enforces per-class (CI / review) retry limits and a hard total cap
 * across both classes. Provides backward compatibility with the legacy
 * single remediationCycleCount field.
 */

import type {
  CIReactionSettings,
  RemediationBudgetCheckResult,
  RemediationBudgetInput,
} from '@protolabsai/types';

/**
 * Extended result that includes the next counter values after incrementing.
 */
export interface RemediationBudgetEnforcerResult extends RemediationBudgetCheckResult {
  nextCiRemediationCount: number;
  nextReviewRemediationCount: number;
}

/**
 * Default settings that match the legacy MAX_TOTAL_REMEDIATION_CYCLES of 4.
 */
export const DEFAULT_CI_REACTION_SETTINGS: CIReactionSettings = {
  maxCiRemediationCycles: 2,
  maxReviewRemediationCycles: 2,
  maxTotalRemediationCycles: 4,
};

/**
 * Legacy count migration result.
 */
export interface LegacyCountMigration {
  ciRemediationCount: number;
  reviewRemediationCount: number;
  remediationCycleCount: number;
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
