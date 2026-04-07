/**
 * Unit tests for MetricsService WSJF scoring.
 *
 * Covers:
 * - WSJF score computation formula
 * - Time decay factor calculation (no deadline, far, near, past)
 * - getAvgDurationByComplexity with historical data and fallback
 * - Epic businessValue propagation to child features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Feature } from '@protolabsai/types';
import { MetricsService } from '../../../src/services/metrics-service.js';

// Mock FeatureLoader
function createMockFeatureLoader(features: Feature[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    update: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `feat-${Math.random().toString(36).slice(2, 8)}`,
    category: 'test',
    description: 'Test feature',
    status: 'backlog',
    complexity: 'medium',
    ...overrides,
  };
}

describe('MetricsService — WSJF scoring', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService(createMockFeatureLoader());
  });

  // ── computeTimeDecayFactor ─────────────────────────────────────────────

  describe('computeTimeDecayFactor', () => {
    const now = new Date('2026-04-07T00:00:00Z');

    it('returns 0.5 when no deadline', () => {
      expect(service.computeTimeDecayFactor(undefined, now)).toBe(0.5);
    });

    it('returns 1.0 when deadline >30 days out', () => {
      expect(service.computeTimeDecayFactor('2026-05-15', now)).toBe(1.0);
    });

    it('returns 3.0 when at or past deadline', () => {
      expect(service.computeTimeDecayFactor('2026-04-07', now)).toBe(3.0);
      expect(service.computeTimeDecayFactor('2026-04-01', now)).toBe(3.0);
    });

    it('returns escalating value within 30-day window', () => {
      // 15 days out: 1.0 + 2.0*(30-15)/30 = 1.0 + 1.0 = 2.0
      const factor = service.computeTimeDecayFactor('2026-04-22', now);
      expect(factor).toBeCloseTo(2.0, 1);
    });

    it('returns ~1.0 at exactly 30 days out', () => {
      const factor = service.computeTimeDecayFactor('2026-05-07', now);
      expect(factor).toBeCloseTo(1.0, 1);
    });

    it('returns ~3.0 at 1 day before deadline', () => {
      const factor = service.computeTimeDecayFactor('2026-04-08', now);
      // 1 day out: 1.0 + 2.0*(30-1)/30 = 1.0 + 1.933 = 2.933
      expect(factor).toBeGreaterThan(2.8);
    });
  });

  // ── computeWsjfScore ──────────────────────────────────────────────────

  describe('computeWsjfScore', () => {
    const defaultDurations: Record<string, number> = {
      small: 0.5,
      medium: 2,
      large: 5,
      architectural: 10,
    };
    const now = new Date('2026-04-07T00:00:00Z');

    it('returns 0 when businessValue is not set', () => {
      const feature = makeFeature();
      expect(service.computeWsjfScore(feature, defaultDurations, now)).toBe(0);
    });

    it('returns 0 when businessValue is 0', () => {
      const feature = makeFeature({ businessValue: 0 });
      expect(service.computeWsjfScore(feature, defaultDurations, now)).toBe(0);
    });

    it('computes correct score with no deadline', () => {
      const feature = makeFeature({ businessValue: 8, complexity: 'medium' });
      // (8 * 0.5) / 2 = 2.0
      const score = service.computeWsjfScore(feature, defaultDurations, now);
      expect(score).toBe(2.0);
    });

    it('computes correct score with distant deadline', () => {
      const feature = makeFeature({
        businessValue: 10,
        complexity: 'small',
        timeDecayDeadline: '2026-06-01',
      });
      // (10 * 1.0) / 0.5 = 20.0
      const score = service.computeWsjfScore(feature, defaultDurations, now);
      expect(score).toBe(20.0);
    });

    it('computes higher score when deadline is near', () => {
      const noDeadline = makeFeature({ businessValue: 5, complexity: 'medium' });
      const nearDeadline = makeFeature({
        businessValue: 5,
        complexity: 'medium',
        timeDecayDeadline: '2026-04-10',
      });
      const scoreNo = service.computeWsjfScore(noDeadline, defaultDurations, now);
      const scoreNear = service.computeWsjfScore(nearDeadline, defaultDurations, now);
      expect(scoreNear).toBeGreaterThan(scoreNo);
    });

    it('uses default complexity when not set', () => {
      const feature = makeFeature({
        businessValue: 6,
        complexity: undefined,
      });
      // Uses 'medium' default = 2 hours; (6 * 0.5) / 2 = 1.5
      const score = service.computeWsjfScore(feature, defaultDurations, now);
      expect(score).toBe(1.5);
    });

    it('small complexity gives higher score than architectural', () => {
      const small = makeFeature({
        businessValue: 5,
        complexity: 'small',
      });
      const arch = makeFeature({
        businessValue: 5,
        complexity: 'architectural',
      });
      expect(service.computeWsjfScore(small, defaultDurations, now)).toBeGreaterThan(
        service.computeWsjfScore(arch, defaultDurations, now)
      );
    });
  });

  // ── getAvgDurationByComplexity ─────────────────────────────────────────

  describe('getAvgDurationByComplexity', () => {
    it('returns defaults when no completed features exist', async () => {
      const loader = createMockFeatureLoader([]);
      const svc = new MetricsService(loader);
      const result = await svc.getAvgDurationByComplexity('/test');
      expect(result.small).toBe(0.5);
      expect(result.medium).toBe(2);
      expect(result.large).toBe(5);
      expect(result.architectural).toBe(10);
    });

    it('returns defaults when insufficient data (<3 samples)', async () => {
      const features = [
        makeFeature({
          status: 'done',
          complexity: 'small',
          executionHistory: [
            {
              id: '1',
              startedAt: '',
              model: 'sonnet',
              success: true,
              trigger: 'auto',
              durationMs: 3600000,
            },
          ],
        }),
        makeFeature({
          status: 'done',
          complexity: 'small',
          executionHistory: [
            {
              id: '2',
              startedAt: '',
              model: 'sonnet',
              success: true,
              trigger: 'auto',
              durationMs: 1800000,
            },
          ],
        }),
      ];
      const loader = createMockFeatureLoader(features);
      const svc = new MetricsService(loader);
      const result = await svc.getAvgDurationByComplexity('/test');
      // Only 2 samples for small, should use default
      expect(result.small).toBe(0.5);
    });

    it('uses median when >=3 samples available', async () => {
      const features = [1, 2, 3, 4, 5].map((i) =>
        makeFeature({
          status: 'done',
          complexity: 'medium',
          executionHistory: [
            {
              id: `${i}`,
              startedAt: '',
              model: 'sonnet',
              success: true,
              trigger: 'auto' as const,
              durationMs: i * 3600000, // 1h, 2h, 3h, 4h, 5h
            },
          ],
        })
      );
      const loader = createMockFeatureLoader(features);
      const svc = new MetricsService(loader);
      const result = await svc.getAvgDurationByComplexity('/test');
      // Median of [1, 2, 3, 4, 5] = 3
      expect(result.medium).toBe(3);
    });
  });

  // ── propagateEpicBusinessValue ─────────────────────────────────────────

  describe('propagateEpicBusinessValue', () => {
    it('propagates epic value to children without explicit value', () => {
      const epic = makeFeature({ id: 'epic-1', isEpic: true, businessValue: 8 });
      const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1' });
      const child2 = makeFeature({ id: 'child-2', epicId: 'epic-1', businessValue: 3 });
      const orphan = makeFeature({ id: 'orphan' });

      const features = [epic, child1, child2, orphan];
      const count = service.propagateEpicBusinessValue(features);

      expect(count).toBe(1); // Only child1 propagated
      expect(child1.businessValue).toBe(8);
      expect(child2.businessValue).toBe(3); // Kept explicit value
      expect(orphan.businessValue).toBeUndefined();
    });

    it('returns 0 when no epics exist', () => {
      const features = [makeFeature(), makeFeature()];
      expect(service.propagateEpicBusinessValue(features)).toBe(0);
    });

    it('handles children referencing non-existent epic', () => {
      const child = makeFeature({ id: 'child', epicId: 'missing-epic' });
      expect(service.propagateEpicBusinessValue([child])).toBe(0);
      expect(child.businessValue).toBeUndefined();
    });
  });
});
