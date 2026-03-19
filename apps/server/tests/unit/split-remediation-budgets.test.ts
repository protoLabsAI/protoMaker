/**
 * Split Remediation Budget Enforcement — Unit Tests
 *
 * TDD suite for the split remediation budget feature (M3).
 * These tests define the expected behavior of RemediationBudgetEnforcer
 * and FAIL until the implementation is provided.
 *
 * Coverage:
 * - CI increments ciRemediationCount, not reviewRemediationCount
 * - Review increments reviewRemediationCount, not ciRemediationCount
 * - Per-class retry limits are respected independently
 * - CI budget exhaustion produces a CI-specific block message
 * - Review budget exhaustion produces a review-specific block message
 * - Total budget is a hard cap across both classes
 * - Backward compatibility with legacy remediationCycleCount
 */

import { describe, it, expect } from 'vitest';
import type { CIReactionSettings, RemediationBudgetCheckResult } from '@protolabsai/types';

// ── Implementation under test (does not exist yet — tests fail until M4) ──────
// This import will cause all tests in this file to fail until the service
// is implemented as part of the follow-on feature.
import {
  RemediationBudgetEnforcer,
  DEFAULT_CI_REACTION_SETTINGS,
} from '../../src/services/remediation-budget-enforcer.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: CIReactionSettings = {
  maxCiRemediationCycles: 2,
  maxReviewRemediationCycles: 2,
  maxTotalRemediationCycles: 4,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEnforcer(overrides?: Partial<CIReactionSettings>): RemediationBudgetEnforcer {
  return new RemediationBudgetEnforcer({ ...DEFAULT_SETTINGS, ...overrides });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Independent budget incrementing
// ─────────────────────────────────────────────────────────────────────────────

describe('Independent budget incrementing', () => {
  it('CI cycle increments ciRemediationCount, not reviewRemediationCount', () => {
    const enforcer = makeEnforcer();
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      settings: DEFAULT_SETTINGS,
    });

    expect(result.allowed).toBe(true);
    expect(result.nextCiRemediationCount).toBe(1);
    expect(result.nextReviewRemediationCount).toBe(0);
  });

  it('Review cycle increments reviewRemediationCount, not ciRemediationCount', () => {
    const enforcer = makeEnforcer();
    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      settings: DEFAULT_SETTINGS,
    });

    expect(result.allowed).toBe(true);
    expect(result.nextReviewRemediationCount).toBe(1);
    expect(result.nextCiRemediationCount).toBe(0);
  });

  it('Multiple CI cycles only increment ciRemediationCount', () => {
    const enforcer = makeEnforcer();
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 1,
      reviewRemediationCount: 1,
      settings: DEFAULT_SETTINGS,
    });

    expect(result.allowed).toBe(true);
    expect(result.nextCiRemediationCount).toBe(2);
    expect(result.nextReviewRemediationCount).toBe(1); // unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Per-class retry limits
// ─────────────────────────────────────────────────────────────────────────────

describe('Per-class retry limits', () => {
  it('Allows CI remediation when ciRemediationCount is below limit', () => {
    const enforcer = makeEnforcer({ maxCiRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 1,
      reviewRemediationCount: 0,
      settings: { ...DEFAULT_SETTINGS, maxCiRemediationCycles: 2 },
    });

    expect(result.allowed).toBe(true);
  });

  it('Allows review remediation when reviewRemediationCount is below limit', () => {
    const enforcer = makeEnforcer({ maxReviewRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 0,
      reviewRemediationCount: 1,
      settings: { ...DEFAULT_SETTINGS, maxReviewRemediationCycles: 2 },
    });

    expect(result.allowed).toBe(true);
  });

  it('Blocks CI when at limit even if review budget remains', () => {
    const enforcer = makeEnforcer({ maxCiRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 2, // at limit
      reviewRemediationCount: 0, // review budget still available
      settings: { ...DEFAULT_SETTINGS, maxCiRemediationCycles: 2 },
    });

    expect(result.allowed).toBe(false);
    expect(result.exhaustedBudget).toBe('ci');
  });

  it('Blocks review when at limit even if CI budget remains', () => {
    const enforcer = makeEnforcer({ maxReviewRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 0, // CI budget still available
      reviewRemediationCount: 2, // at limit
      settings: { ...DEFAULT_SETTINGS, maxReviewRemediationCycles: 2 },
    });

    expect(result.allowed).toBe(false);
    expect(result.exhaustedBudget).toBe('review');
  });

  it('CI and review limits are independent — exhausting one does not affect the other', () => {
    const enforcer = makeEnforcer({ maxCiRemediationCycles: 1, maxReviewRemediationCycles: 1 });
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 1,
      maxReviewRemediationCycles: 1,
      maxTotalRemediationCycles: 4,
    };

    // CI at limit
    const ciBlocked = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 1,
      reviewRemediationCount: 0,
      settings,
    });
    expect(ciBlocked.allowed).toBe(false);
    expect(ciBlocked.exhaustedBudget).toBe('ci');

    // Review still allowed
    const reviewAllowed = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 1,
      reviewRemediationCount: 0,
      settings,
    });
    expect(reviewAllowed.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CI budget exhaustion block message
// ─────────────────────────────────────────────────────────────────────────────

describe('CI budget exhaustion message', () => {
  it('Returns a CI-specific message when CI budget is exhausted', () => {
    const enforcer = makeEnforcer({ maxCiRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 2,
      reviewRemediationCount: 0,
      settings: { ...DEFAULT_SETTINGS, maxCiRemediationCycles: 2 },
    });

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/ci/i);
    expect(result.message).toMatch(/2/); // mentions the limit
  });

  it('CI exhaustion message does not mention review budget', () => {
    const enforcer = makeEnforcer({ maxCiRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 2,
      reviewRemediationCount: 0,
      settings: { ...DEFAULT_SETTINGS, maxCiRemediationCycles: 2 },
    });

    expect(result.message).not.toMatch(/review/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Review budget exhaustion block message
// ─────────────────────────────────────────────────────────────────────────────

describe('Review budget exhaustion message', () => {
  it('Returns a review-specific message when review budget is exhausted', () => {
    const enforcer = makeEnforcer({ maxReviewRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 0,
      reviewRemediationCount: 2,
      settings: { ...DEFAULT_SETTINGS, maxReviewRemediationCycles: 2 },
    });

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/review/i);
    expect(result.message).toMatch(/2/); // mentions the limit
  });

  it('Review exhaustion message does not mention CI budget', () => {
    const enforcer = makeEnforcer({ maxReviewRemediationCycles: 2 });
    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 0,
      reviewRemediationCount: 2,
      settings: { ...DEFAULT_SETTINGS, maxReviewRemediationCycles: 2 },
    });

    expect(result.message).not.toMatch(/\bci\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Total budget hard cap
// ─────────────────────────────────────────────────────────────────────────────

describe('Total budget hard cap', () => {
  it('Blocks CI when total cap is reached even if CI per-class limit not hit', () => {
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 5, // plenty of CI budget
      maxReviewRemediationCycles: 5, // plenty of review budget
      maxTotalRemediationCycles: 4, // but total cap is tight
    };
    const enforcer = makeEnforcer(settings);

    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 2,
      reviewRemediationCount: 2, // total = 4, at the cap
      settings,
    });

    expect(result.allowed).toBe(false);
    expect(result.exhaustedBudget).toBe('total');
  });

  it('Blocks review when total cap is reached even if review per-class limit not hit', () => {
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 5,
      maxReviewRemediationCycles: 5,
      maxTotalRemediationCycles: 3,
    };
    const enforcer = makeEnforcer(settings);

    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 1,
      reviewRemediationCount: 2, // total = 3, at the cap
      settings,
    });

    expect(result.allowed).toBe(false);
    expect(result.exhaustedBudget).toBe('total');
  });

  it('Total cap exhaustion message mentions total limit', () => {
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 5,
      maxReviewRemediationCycles: 5,
      maxTotalRemediationCycles: 4,
    };
    const enforcer = makeEnforcer(settings);

    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 2,
      reviewRemediationCount: 2,
      settings,
    });

    expect(result.message).toMatch(/total/i);
    expect(result.message).toMatch(/4/);
  });

  it('Total cap is checked before per-class limits', () => {
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 2,
      maxReviewRemediationCycles: 2,
      maxTotalRemediationCycles: 3, // total cap lower than ci_max + review_max
    };
    const enforcer = makeEnforcer(settings);

    // Both per-class limits would allow 1 more each, but total is exhausted
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 1,
      reviewRemediationCount: 2, // total = 3
      settings,
    });

    expect(result.allowed).toBe(false);
    expect(result.exhaustedBudget).toBe('total');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Backward compatibility with legacy remediationCycleCount
// ─────────────────────────────────────────────────────────────────────────────

describe('Backward compatibility with legacy remediationCycleCount', () => {
  it('Accepts legacy remediationCycleCount when split counts are absent', () => {
    const enforcer = makeEnforcer();
    // Feature has old-style single counter, no split counts
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      remediationCycleCount: 3, // legacy field
      settings: DEFAULT_SETTINGS,
    });

    // Should still work — legacy count is a hint, not a blocker on its own
    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe('boolean');
  });

  it('Uses legacy remediationCycleCount as total when split counts are both zero and legacy is non-zero', () => {
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 5,
      maxReviewRemediationCycles: 5,
      maxTotalRemediationCycles: 3,
    };
    const enforcer = makeEnforcer(settings);

    // Legacy feature: old total was already at cap, split counts haven't been migrated yet
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      remediationCycleCount: 3, // at the total cap — should be respected
      settings,
    });

    expect(result.allowed).toBe(false);
    expect(result.exhaustedBudget).toBe('total');
  });

  it('Prefers split counts over legacy remediationCycleCount when both are present', () => {
    const settings: CIReactionSettings = {
      maxCiRemediationCycles: 5,
      maxReviewRemediationCycles: 5,
      maxTotalRemediationCycles: 4,
    };
    const enforcer = makeEnforcer(settings);

    // Legacy count says 3 (not at cap), split counts say 1+1=2 (under cap)
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 1,
      reviewRemediationCount: 1,
      remediationCycleCount: 3,
      settings,
    });

    // Split counts win: total = 2, under cap of 4
    expect(result.allowed).toBe(true);
  });

  it('DEFAULT_CI_REACTION_SETTINGS matches legacy MAX_TOTAL_REMEDIATION_CYCLES of 4', () => {
    // Ensures the default settings are backward compatible with the legacy 4-cycle cap
    expect(DEFAULT_CI_REACTION_SETTINGS.maxTotalRemediationCycles).toBe(4);
  });

  it('RemediationBudgetEnforcer.fromLegacyCount provides a migration helper', () => {
    // Legacy features only have remediationCycleCount — this helper splits it
    // proportionally or attributes it all to total for cap checking
    const input = RemediationBudgetEnforcer.fromLegacyCount(3);

    expect(input).toBeDefined();
    expect(typeof input.ciRemediationCount).toBe('number');
    expect(typeof input.reviewRemediationCount).toBe('number');
    // The sum of split counts should equal or proxy the legacy count for total cap purposes
    expect(input.remediationCycleCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Return shape contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Return shape', () => {
  it('Returns nextCiRemediationCount and nextReviewRemediationCount on success', () => {
    const enforcer = makeEnforcer();
    const result = enforcer.checkAndIncrement({
      type: 'ci',
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      settings: DEFAULT_SETTINGS,
    });

    expect(result).toHaveProperty('nextCiRemediationCount');
    expect(result).toHaveProperty('nextReviewRemediationCount');
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('message');
  });

  it('Returns exhaustedBudget as undefined when allowed', () => {
    const enforcer = makeEnforcer();
    const result = enforcer.checkAndIncrement({
      type: 'review',
      ciRemediationCount: 0,
      reviewRemediationCount: 0,
      settings: DEFAULT_SETTINGS,
    });

    expect(result.allowed).toBe(true);
    expect(result.exhaustedBudget).toBeUndefined();
  });
});
