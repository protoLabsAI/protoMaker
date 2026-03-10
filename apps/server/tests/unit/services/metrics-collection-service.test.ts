/**
 * Unit tests for metrics-collection-service.ts
 *
 * Covers:
 * - classifyInterventionType() — all three intervention type classifications
 * - AutonomyMetricsService.getAutonomyMetrics() — rate calculation and window filtering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before any imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  classifyInterventionType,
  AutonomyMetricsService,
} from '@/services/metrics-collection-service.js';
import type { Feature, ExecutionRecord } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExecution(trigger: 'auto' | 'manual' | 'retry'): ExecutionRecord {
  return {
    id: `exec-${Math.random().toString(36).slice(2)}`,
    startedAt: new Date().toISOString(),
    model: 'claude-sonnet',
    success: true,
    trigger,
  };
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `feature-${Math.random().toString(36).slice(2)}`,
    category: 'test',
    description: 'Test feature',
    status: 'done',
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyInterventionType()
// ---------------------------------------------------------------------------

describe('classifyInterventionType()', () => {
  describe('fully_autonomous', () => {
    it('classifies as fully_autonomous when all executions are auto', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('auto'), makeExecution('auto')],
      });
      expect(classifyInterventionType(feature)).toBe('fully_autonomous');
    });

    it('classifies as fully_autonomous when all executions are retry', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('auto'), makeExecution('retry')],
      });
      expect(classifyInterventionType(feature)).toBe('fully_autonomous');
    });

    it('classifies as fully_autonomous for a single auto execution', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('auto')],
      });
      expect(classifyInterventionType(feature)).toBe('fully_autonomous');
    });
  });

  describe('assisted', () => {
    it('classifies as assisted when there is a mix of auto and manual executions', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('auto'), makeExecution('manual')],
      });
      expect(classifyInterventionType(feature)).toBe('assisted');
    });

    it('classifies as assisted when there is a mix of retry and manual executions', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('retry'), makeExecution('manual'), makeExecution('auto')],
      });
      expect(classifyInterventionType(feature)).toBe('assisted');
    });

    it('classifies as assisted when only one manual execution among many auto', () => {
      const feature = makeFeature({
        executionHistory: [
          makeExecution('auto'),
          makeExecution('auto'),
          makeExecution('manual'),
          makeExecution('auto'),
        ],
      });
      expect(classifyInterventionType(feature)).toBe('assisted');
    });
  });

  describe('manual', () => {
    it('classifies as manual when there are no executions at all', () => {
      const feature = makeFeature({ executionHistory: [] });
      expect(classifyInterventionType(feature)).toBe('manual');
    });

    it('classifies as manual when executionHistory is undefined', () => {
      const feature = makeFeature({ executionHistory: undefined });
      expect(classifyInterventionType(feature)).toBe('manual');
    });

    it('classifies as manual when all executions are manual', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('manual'), makeExecution('manual')],
      });
      expect(classifyInterventionType(feature)).toBe('manual');
    });

    it('classifies as manual for a single manual execution', () => {
      const feature = makeFeature({
        executionHistory: [makeExecution('manual')],
      });
      expect(classifyInterventionType(feature)).toBe('manual');
    });
  });
});

// ---------------------------------------------------------------------------
// AutonomyMetricsService.getAutonomyMetrics()
// ---------------------------------------------------------------------------

describe('AutonomyMetricsService.getAutonomyMetrics()', () => {
  const projectPath = '/test/project';

  const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let featureLoader: { getAll: ReturnType<typeof vi.fn> };
  let service: AutonomyMetricsService;

  beforeEach(() => {
    featureLoader = {
      getAll: vi.fn().mockResolvedValue([]),
    };
    service = new AutonomyMetricsService(featureLoader as never);
  });

  it('returns zero rate when there are no completed features', async () => {
    featureLoader.getAll.mockResolvedValue([]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.autonomy_rate).toBe(0);
    expect(result.total_completed).toBe(0);
    expect(result.breakdown).toEqual({ fully_autonomous: 0, assisted: 0, manual: 0 });
  });

  it('counts only features with status === done', async () => {
    featureLoader.getAll.mockResolvedValue([
      makeFeature({
        status: 'in_progress',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto')],
      }),
      makeFeature({
        status: 'backlog',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto')],
      }),
      makeFeature({
        status: 'done',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto')],
      }),
    ]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.total_completed).toBe(1);
    expect(result.breakdown.fully_autonomous).toBe(1);
  });

  it('excludes features completed outside the rolling window', async () => {
    featureLoader.getAll.mockResolvedValue([
      makeFeature({
        status: 'done',
        completedAt: thirtyOneDaysAgo,
        executionHistory: [makeExecution('auto')],
      }),
    ]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.total_completed).toBe(0);
  });

  it('includes features completed inside the rolling window', async () => {
    featureLoader.getAll.mockResolvedValue([
      makeFeature({
        status: 'done',
        completedAt: thirtyDaysAgo,
        executionHistory: [makeExecution('auto')],
      }),
    ]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.total_completed).toBe(1);
  });

  it('calculates autonomy_rate correctly for mixed features', async () => {
    featureLoader.getAll.mockResolvedValue([
      // 2 fully autonomous
      makeFeature({
        status: 'done',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto')],
      }),
      makeFeature({
        status: 'done',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto'), makeExecution('retry')],
      }),
      // 1 assisted
      makeFeature({
        status: 'done',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto'), makeExecution('manual')],
      }),
      // 1 manual
      makeFeature({ status: 'done', completedAt: yesterday, executionHistory: [] }),
    ]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.total_completed).toBe(4);
    expect(result.breakdown.fully_autonomous).toBe(2);
    expect(result.breakdown.assisted).toBe(1);
    expect(result.breakdown.manual).toBe(1);
    expect(result.autonomy_rate).toBeCloseTo(2 / 4);
  });

  it('returns autonomy_rate of 1 when all features are fully_autonomous', async () => {
    featureLoader.getAll.mockResolvedValue([
      makeFeature({
        status: 'done',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto')],
      }),
      makeFeature({
        status: 'done',
        completedAt: yesterday,
        executionHistory: [makeExecution('auto')],
      }),
    ]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.autonomy_rate).toBe(1);
  });

  it('falls back to updatedAt when completedAt is missing', async () => {
    const feature = makeFeature({
      status: 'done',
      completedAt: undefined,
      updatedAt: yesterday,
      executionHistory: [makeExecution('auto')],
    });
    featureLoader.getAll.mockResolvedValue([feature]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.total_completed).toBe(1);
  });

  it('skips features with no timestamp', async () => {
    const feature = makeFeature({
      status: 'done',
      completedAt: undefined,
      updatedAt: undefined,
      executionHistory: [makeExecution('auto')],
    });
    featureLoader.getAll.mockResolvedValue([feature]);
    const result = await service.getAutonomyMetrics(projectPath);
    expect(result.total_completed).toBe(0);
  });

  it('respects a custom windowDays parameter', async () => {
    // Feature completed 5 days ago
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    featureLoader.getAll.mockResolvedValue([
      makeFeature({
        status: 'done',
        completedAt: fiveDaysAgo,
        executionHistory: [makeExecution('auto')],
      }),
    ]);

    // windowDays=7 should include it
    const sevenDayResult = await service.getAutonomyMetrics(projectPath, 7);
    expect(sevenDayResult.total_completed).toBe(1);

    // windowDays=3 should exclude it
    const threeDayResult = await service.getAutonomyMetrics(projectPath, 3);
    expect(threeDayResult.total_completed).toBe(0);
  });

  it('includes window_start and window_end in the response', async () => {
    const result = await service.getAutonomyMetrics(projectPath);
    expect(new Date(result.window_start).getTime()).toBeLessThan(
      new Date(result.window_end).getTime()
    );
    // window_end should be very close to now
    expect(Date.now() - new Date(result.window_end).getTime()).toBeLessThan(5000);
  });
});
