import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TrajectoryPatternMiner,
  CONFIDENCE_THRESHOLD,
  MIN_SAMPLE_SIZE,
  PRUNE_THRESHOLD,
  DECAY_DAYS,
  DECAY_FACTOR,
  LONG_RUN_MS,
} from '@/services/trajectory-pattern-miner.js';
import type { VerifiedTrajectory } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTrajectory(overrides: Partial<VerifiedTrajectory> = {}): VerifiedTrajectory {
  return {
    featureId: 'feature-abc',
    domain: 'backend',
    complexity: 'medium',
    model: 'claude-sonnet-4-6',
    planSummary: 'Add REST endpoint',
    executionSummary: 'Created route and service',
    costUsd: 0.05,
    durationMs: 30_000,
    retryCount: 0,
    verified: true,
    timestamp: new Date().toISOString(),
    attemptNumber: 1,
    ...overrides,
  };
}

/** Create N trajectories with shared overrides */
function makeN(
  n: number,
  overrides: Partial<VerifiedTrajectory> = {}
): VerifiedTrajectory[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrajectory({ featureId: `feature-${i}`, attemptNumber: 1, ...overrides })
  );
}

/** ISO timestamp N days ago */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// fs/promises mock helpers
// ---------------------------------------------------------------------------

type FsPromises = typeof import('node:fs/promises');

function setupFsMock(config: {
  featureDirs?: string[];
  attemptFiles?: Record<string, string[]>;
  trajectoryContents?: Record<string, VerifiedTrajectory[]>;
}): void {
  const fsModule: Partial<FsPromises> = {
    readdir: vi.fn(async (p: unknown) => {
      const dirPath = String(p);

      // Root trajectory dir → return feature folder names
      if (dirPath.endsWith('/trajectory')) {
        return (config.featureDirs ?? []) as unknown as ReturnType<FsPromises['readdir']>;
      }

      // Feature subdirectory → return attempt file names
      const featureId = dirPath.split('/').at(-1) ?? '';
      return ((config.attemptFiles ?? {})[featureId] ?? []) as unknown as ReturnType<
        FsPromises['readdir']
      >;
    }),

    readFile: vi.fn(async (p: unknown) => {
      const filePath = String(p);
      // Find which feature this file belongs to
      for (const [featureId, trajectories] of Object.entries(
        config.trajectoryContents ?? {}
      )) {
        for (let idx = 0; idx < trajectories.length; idx++) {
          if (filePath.includes(`attempt-${idx + 1}.json`) && filePath.includes(featureId)) {
            return JSON.stringify(trajectories[idx]);
          }
        }
      }
      throw new Error(`File not found in mock: ${filePath}`);
    }) as FsPromises['readFile'],

    mkdir: vi.fn(async () => undefined) as unknown as FsPromises['mkdir'],
    writeFile: vi.fn(async () => undefined) as unknown as FsPromises['writeFile'],
  };

  vi.doMock('node:fs/promises', () => fsModule);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrajectoryPatternMiner', () => {
  let miner: TrajectoryPatternMiner;

  beforeEach(() => {
    vi.resetAllMocks();
    miner = new TrajectoryPatternMiner();
  });

  // -----------------------------------------------------------------------
  // computeConfidence
  // -----------------------------------------------------------------------
  describe('computeConfidence', () => {
    it('returns 0 for zero signal strength', () => {
      expect(miner.computeConfidence(10, 0)).toBe(0);
    });

    it('scales with sample size up to 20', () => {
      const c10 = miner.computeConfidence(10, 1.0);
      const c20 = miner.computeConfidence(20, 1.0);
      expect(c10).toBeCloseTo(0.5);
      expect(c20).toBeCloseTo(1.0);
    });

    it('caps at 1.0 for large samples', () => {
      expect(miner.computeConfidence(100, 1.0)).toBeCloseTo(1.0);
    });

    it('combines sample factor with signal strength', () => {
      // 20 samples, 80% signal → 0.8
      expect(miner.computeConfidence(20, 0.8)).toBeCloseTo(0.8);
    });
  });

  // -----------------------------------------------------------------------
  // applyDecay
  // -----------------------------------------------------------------------
  describe('applyDecay', () => {
    it('does not decay recent patterns', () => {
      const pattern = {
        type: 'high-failure-domain' as const,
        description: 'test',
        confidence: 0.8,
        sampleSize: 5,
        lastSeenAt: daysAgo(10),
        details: {},
      };
      const result = miner.applyDecay(pattern);
      expect(result.confidence).toBeCloseTo(0.8);
    });

    it('halves confidence for patterns older than 90 days', () => {
      const pattern = {
        type: 'high-failure-domain' as const,
        description: 'test',
        confidence: 0.8,
        sampleSize: 5,
        lastSeenAt: daysAgo(DECAY_DAYS + 1),
        details: {},
      };
      const result = miner.applyDecay(pattern);
      expect(result.confidence).toBeCloseTo(0.8 * DECAY_FACTOR);
    });

    it('does not decay patterns exactly at boundary (89 days)', () => {
      const pattern = {
        type: 'high-failure-domain' as const,
        description: 'test',
        confidence: 0.6,
        sampleSize: 5,
        lastSeenAt: daysAgo(DECAY_DAYS - 1),
        details: {},
      };
      const result = miner.applyDecay(pattern);
      expect(result.confidence).toBeCloseTo(0.6);
    });
  });

  // -----------------------------------------------------------------------
  // mineHighFailureDomains
  // -----------------------------------------------------------------------
  describe('mineHighFailureDomains', () => {
    it('identifies domain with >50% retry rate', () => {
      const trajectories = [
        makeTrajectory({ domain: 'backend', retryCount: 2 }),
        makeTrajectory({ domain: 'backend', retryCount: 1 }),
        makeTrajectory({ domain: 'backend', retryCount: 0 }),
        // 2/3 = 67% retry rate — above threshold
      ];
      const patterns = miner.mineHighFailureDomains(trajectories);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('high-failure-domain');
      expect(patterns[0].details.domain).toBe('backend');
    });

    it('does not flag domain with <= 50% retry rate', () => {
      const trajectories = [
        makeTrajectory({ domain: 'frontend', retryCount: 1 }),
        makeTrajectory({ domain: 'frontend', retryCount: 0 }),
        makeTrajectory({ domain: 'frontend', retryCount: 0 }),
        // 1/3 = 33% — below threshold
      ];
      const patterns = miner.mineHighFailureDomains(trajectories);
      expect(patterns).toHaveLength(0);
    });

    it('handles empty trajectory list', () => {
      expect(miner.mineHighFailureDomains([])).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // mineModelComplexitySuccess
  // -----------------------------------------------------------------------
  describe('mineModelComplexitySuccess', () => {
    it('identifies model-complexity pair with >= 80% first-attempt success', () => {
      const ts = makeN(5, {
        model: 'claude-sonnet-4-6',
        complexity: 'small',
        verified: true,
        retryCount: 0,
      });
      const patterns = miner.mineModelComplexitySuccess(ts);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('model-complexity-success');
      expect(patterns[0].details.model).toBe('claude-sonnet-4-6');
      expect(patterns[0].details.complexity).toBe('small');
    });

    it('does not flag pairs with < 80% success', () => {
      const ts = [
        makeTrajectory({ model: 'claude-haiku', complexity: 'large', verified: true, retryCount: 0 }),
        makeTrajectory({ model: 'claude-haiku', complexity: 'large', verified: false, retryCount: 1 }),
        // 50% — below threshold
      ];
      const patterns = miner.mineModelComplexitySuccess(ts);
      expect(patterns).toHaveLength(0);
    });

    it('does not flag verified trajectories that had retries', () => {
      const ts = makeN(5, {
        model: 'claude-opus',
        complexity: 'architectural',
        verified: true,
        retryCount: 2, // had retries — not first-attempt success
      });
      const patterns = miner.mineModelComplexitySuccess(ts);
      // successRate = 0 / 5 = 0%
      expect(patterns).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // mineEscalationReasons
  // -----------------------------------------------------------------------
  describe('mineEscalationReasons', () => {
    it('identifies common escalation reason when count >= MIN_SAMPLE_SIZE', () => {
      const reason = 'architecture changes required';
      const ts = makeN(MIN_SAMPLE_SIZE, { escalationReason: reason });
      const patterns = miner.mineEscalationReasons(ts);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('escalation-reason');
      expect(String(patterns[0].details.reason)).toContain('architecture');
    });

    it('does not flag rare escalation reasons below MIN_SAMPLE_SIZE', () => {
      const ts = [
        makeTrajectory({ escalationReason: 'unique reason xyz' }),
        makeTrajectory({ escalationReason: 'unique reason xyz' }),
        // only 2 — below MIN_SAMPLE_SIZE of 3
      ];
      const patterns = miner.mineEscalationReasons(ts);
      expect(patterns).toHaveLength(0);
    });

    it('ignores trajectories with no escalation reason', () => {
      const ts = makeN(10, { escalationReason: undefined });
      expect(miner.mineEscalationReasons(ts)).toHaveLength(0);
    });

    it('normalizes escalation reasons to first 100 chars lowercase', () => {
      const longReason = 'A'.repeat(150);
      const ts = makeN(MIN_SAMPLE_SIZE, { escalationReason: longReason });
      const patterns = miner.mineEscalationReasons(ts);
      expect(patterns).toHaveLength(1);
      expect(String(patterns[0].details.reason)).toHaveLength(100);
    });
  });

  // -----------------------------------------------------------------------
  // mineTurnBudgetIssues
  // -----------------------------------------------------------------------
  describe('mineTurnBudgetIssues', () => {
    it('flags domain where >50% of runs exceed 60 minutes', () => {
      const ts = [
        makeTrajectory({ domain: 'devops', durationMs: LONG_RUN_MS + 1 }),
        makeTrajectory({ domain: 'devops', durationMs: LONG_RUN_MS + 1 }),
        makeTrajectory({ domain: 'devops', durationMs: 10_000 }),
        // 2/3 = 67% — above threshold
      ];
      const patterns = miner.mineTurnBudgetIssues(ts);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('turn-budget');
      expect(patterns[0].details.domain).toBe('devops');
    });

    it('does not flag domain with <= 50% long runs', () => {
      const ts = [
        makeTrajectory({ domain: 'frontend', durationMs: LONG_RUN_MS + 1 }),
        makeTrajectory({ domain: 'frontend', durationMs: 10_000 }),
        makeTrajectory({ domain: 'frontend', durationMs: 10_000 }),
        // 1/3 = 33% — below threshold
      ];
      expect(miner.mineTurnBudgetIssues(ts)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Confidence threshold and pruning
  // -----------------------------------------------------------------------
  describe('confidence thresholds and pruning', () => {
    it('prunes patterns below PRUNE_THRESHOLD after decay', () => {
      // Confidence = computeConfidence(3, 0.6) = (3/20)*0.6 = 0.09 — below 0.2 threshold
      // after decay (>90 days) it halves further
      const pattern = {
        type: 'high-failure-domain' as const,
        description: 'test',
        confidence: 0.09,
        sampleSize: 3,
        lastSeenAt: daysAgo(DECAY_DAYS + 1),
        details: {},
      };
      const decayed = miner.applyDecay(pattern);
      expect(decayed.confidence).toBeLessThan(PRUNE_THRESHOLD);
    });

    it('constants are at expected values', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.5);
      expect(MIN_SAMPLE_SIZE).toBe(3);
      expect(PRUNE_THRESHOLD).toBe(0.2);
      expect(DECAY_DAYS).toBe(90);
      expect(DECAY_FACTOR).toBe(0.5);
    });
  });
});
