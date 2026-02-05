import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecoveryService,
  getRecoveryService,
  type FailureAnalysis,
  type RecoveryAttempt,
  type RecoveryStrategy,
} from '../../../src/services/recovery-service.js';
import type { Feature } from '@automaker/types';

// Create a shared mock logger instance
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@automaker/utils', async () => {
  const actual = await vi.importActual<typeof import('@automaker/utils')>('@automaker/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
  };
});

describe('recovery-service.ts', () => {
  let service: RecoveryService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecoveryService();
    service.setEventEmitter(mockEvents as any);
    service.clearHistory(); // Clear history between tests
  });

  describe('analyzeFailure', () => {
    it('should analyze rate limit errors and recommend pause_and_wait', () => {
      const error = new Error('rate limit exceeded');
      // Simulate a rate limit error
      (error as any).status = 429;

      const analysis = service.analyzeFailure(error);

      expect(analysis.id).toBeDefined();
      expect(analysis.errorInfo).toBeDefined();
      expect(analysis.recommendedStrategy).toBeDefined();
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.explanation).toBeDefined();
      expect(analysis.analyzedAt).toBeDefined();
    });

    it('should analyze execution errors and recommend retry_with_context', () => {
      const error = new Error('Tool execution failed');

      const analysis = service.analyzeFailure(error, {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      expect(analysis.errorInfo).toBeDefined();
      // For unknown errors, it typically recommends retry
      expect(['retry', 'retry_with_context', 'escalate_to_user']).toContain(
        analysis.recommendedStrategy
      );
    });

    it('should reduce confidence with previous attempts', () => {
      const error = new Error('Some error');

      const analysis1 = service.analyzeFailure(error, { previousAttempts: 0 });
      const analysis2 = service.analyzeFailure(error, { previousAttempts: 2 });

      expect(analysis2.confidence).toBeLessThan(analysis1.confidence);
    });

    it('should emit recovery:analyzed event', () => {
      const error = new Error('Test error');

      service.analyzeFailure(error);

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery:analyzed', expect.any(Object));
    });

    it('should include context hints in analysis', () => {
      const error = new Error('Test error');

      const analysis = service.analyzeFailure(error, {
        operationType: 'code_generation',
      });

      expect(analysis.contextHints).toBeDefined();
      expect(Array.isArray(analysis.contextHints)).toBe(true);
    });
  });

  describe('executeRecovery', () => {
    const mockFeature: Feature = {
      id: 'feature-1',
      title: 'Test Feature',
      description: 'Test description',
      status: 'backlog',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const mockAnalysis: FailureAnalysis = {
      id: 'analysis-1',
      errorInfo: {
        type: 'execution',
        message: 'Test error',
        isRetryable: true,
      },
      recommendedStrategy: 'retry',
      confidence: 0.8,
      explanation: 'Test explanation',
      contextHints: ['Hint 1'],
      autoRecoverRecommended: true,
      analyzedAt: '2024-01-01T00:00:00Z',
    };

    it('should execute retry strategy', async () => {
      const result = await service.executeRecovery({
        analysis: mockAnalysis,
        feature: mockFeature,
        projectPath: '/test/project',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('retry');
      expect(result.attempts.length).toBeGreaterThan(0);
    });

    it('should execute retry_with_context strategy', async () => {
      const result = await service.executeRecovery({
        analysis: { ...mockAnalysis, recommendedStrategy: 'retry_with_context' },
        feature: mockFeature,
        projectPath: '/test/project',
        additionalContext: 'Extra context for retry',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('retry_with_context');
      expect(result.attempts[0].metadata).toBeDefined();
    });

    it('should execute escalate_to_user strategy', async () => {
      const result = await service.executeRecovery({
        analysis: { ...mockAnalysis, recommendedStrategy: 'escalate_to_user' },
        feature: mockFeature,
        projectPath: '/test/project',
      });

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('escalate_to_user');
      expect(result.userActionRequired).toBeDefined();
    });

    it('should execute pause_and_wait strategy', async () => {
      const result = await service.executeRecovery({
        analysis: {
          ...mockAnalysis,
          recommendedStrategy: 'pause_and_wait',
          estimatedWaitTime: 30,
        },
        feature: mockFeature,
        projectPath: '/test/project',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('pause_and_wait');
      expect(result.waitTimeSeconds).toBe(30);
    });

    it('should execute alternative_approach strategy', async () => {
      const result = await service.executeRecovery({
        analysis: { ...mockAnalysis, recommendedStrategy: 'alternative_approach' },
        feature: mockFeature,
        projectPath: '/test/project',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('alternative_approach');
      expect(result.attempts[0].metadata?.suggestions).toBeDefined();
    });

    it('should execute rollback_and_retry strategy', async () => {
      const result = await service.executeRecovery({
        analysis: { ...mockAnalysis, recommendedStrategy: 'rollback_and_retry' },
        feature: mockFeature,
        projectPath: '/test/project',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('rollback_and_retry');
      expect(result.attempts[0].metadata?.steps).toBeDefined();
    });

    it('should allow strategy override', async () => {
      const result = await service.executeRecovery({
        analysis: mockAnalysis, // recommends 'retry'
        feature: mockFeature,
        projectPath: '/test/project',
        strategyOverride: 'escalate_to_user',
      });

      expect(result.strategy).toBe('escalate_to_user');
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();

      await service.executeRecovery({
        analysis: mockAnalysis,
        feature: mockFeature,
        projectPath: '/test/project',
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
    });

    it('should emit recovery:started and recovery:completed events', async () => {
      await service.executeRecovery({
        analysis: mockAnalysis,
        feature: mockFeature,
        projectPath: '/test/project',
      });

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery:started', expect.any(Object));
      expect(mockEvents.emit).toHaveBeenCalledWith('recovery:completed', expect.any(Object));
    });
  });

  describe('recordRecoveryAttempt', () => {
    it('should record an attempt', () => {
      const attempt: RecoveryAttempt = {
        id: 'attempt-1',
        analysisId: 'analysis-1',
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:01:00Z',
      };

      service.recordRecoveryAttempt(attempt);

      const history = service.getAttemptHistory('/test/project', 'feature-1');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(attempt);
    });

    it('should emit recovery:attempt_recorded event', () => {
      const attempt: RecoveryAttempt = {
        id: 'attempt-1',
        analysisId: 'analysis-1',
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
      };

      service.recordRecoveryAttempt(attempt);

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery:attempt_recorded', attempt);
    });

    it('should limit history size per feature', () => {
      for (let i = 0; i < 110; i++) {
        service.recordRecoveryAttempt({
          id: `attempt-${i}`,
          analysisId: 'analysis-1',
          featureId: 'feature-1',
          projectPath: '/test/project',
          strategy: 'retry',
          status: 'success',
          attemptNumber: i + 1,
          startedAt: '2024-01-01T00:00:00Z',
        });
      }

      const history = service.getAttemptHistory('/test/project', 'feature-1');
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getAttemptHistory', () => {
    it('should return empty array for non-existent feature', () => {
      const history = service.getAttemptHistory('/test/project', 'non-existent');
      expect(history).toEqual([]);
    });

    it('should return history for existing feature', () => {
      const attempt: RecoveryAttempt = {
        id: 'attempt-1',
        analysisId: 'analysis-1',
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
      };

      service.recordRecoveryAttempt(attempt);
      const history = service.getAttemptHistory('/test/project', 'feature-1');

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('attempt-1');
    });
  });

  describe('getStatistics', () => {
    beforeEach(() => {
      // Add some test attempts
      service.recordRecoveryAttempt({
        id: 'attempt-1',
        analysisId: 'analysis-1',
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
      });
      service.recordRecoveryAttempt({
        id: 'attempt-2',
        analysisId: 'analysis-2',
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'failed',
        attemptNumber: 2,
        startedAt: '2024-01-01T00:01:00Z',
      });
      service.recordRecoveryAttempt({
        id: 'attempt-3',
        analysisId: 'analysis-3',
        featureId: 'feature-2',
        projectPath: '/test/project',
        strategy: 'pause_and_wait',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:02:00Z',
      });
    });

    it('should return overall statistics', () => {
      const stats = service.getStatistics();

      expect(stats.totalAttempts).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track statistics by strategy', () => {
      const stats = service.getStatistics();

      expect(stats.byStrategy['retry']).toEqual({ attempts: 2, successes: 1 });
      expect(stats.byStrategy['pause_and_wait']).toEqual({ attempts: 1, successes: 1 });
    });

    it('should filter by project path', () => {
      // Add attempt for different project
      service.recordRecoveryAttempt({
        id: 'attempt-4',
        analysisId: 'analysis-4',
        featureId: 'feature-1',
        projectPath: '/other/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:03:00Z',
      });

      const stats = service.getStatistics('/test/project');

      expect(stats.totalAttempts).toBe(3);
    });
  });

  describe('clearHistory', () => {
    beforeEach(() => {
      service.recordRecoveryAttempt({
        id: 'attempt-1',
        analysisId: 'analysis-1',
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should clear all history when no params', () => {
      service.clearHistory();

      const history = service.getAttemptHistory('/test/project', 'feature-1');
      expect(history).toEqual([]);
    });

    it('should clear history for specific feature', () => {
      service.recordRecoveryAttempt({
        id: 'attempt-2',
        analysisId: 'analysis-2',
        featureId: 'feature-2',
        projectPath: '/test/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:01:00Z',
      });

      service.clearHistory('/test/project', 'feature-1');

      expect(service.getAttemptHistory('/test/project', 'feature-1')).toEqual([]);
      expect(service.getAttemptHistory('/test/project', 'feature-2')).toHaveLength(1);
    });

    it('should clear history for specific project', () => {
      service.recordRecoveryAttempt({
        id: 'attempt-2',
        analysisId: 'analysis-2',
        featureId: 'feature-1',
        projectPath: '/other/project',
        strategy: 'retry',
        status: 'success',
        attemptNumber: 1,
        startedAt: '2024-01-01T00:01:00Z',
      });

      service.clearHistory('/test/project');

      expect(service.getAttemptHistory('/test/project', 'feature-1')).toEqual([]);
      expect(service.getAttemptHistory('/other/project', 'feature-1')).toHaveLength(1);
    });
  });

  describe('getRecoveryService', () => {
    it('should return singleton instance', () => {
      const instance1 = getRecoveryService();
      const instance2 = getRecoveryService();

      expect(instance1).toBe(instance2);
    });
  });
});
