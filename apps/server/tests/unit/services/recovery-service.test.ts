import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecoveryService,
  getRecoveryService,
  createRecoveryService,
} from '../../../src/services/recovery-service.js';
import type { RecoveryRecord } from '../../../src/services/recovery-service.js';
import type {
  FailureAnalysis,
  ErrorInfo,
  ExecutionContext,
  RecoveryConfig,
} from '@automaker/types';
import { DEFAULT_RECOVERY_CONFIG } from '@automaker/types';

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

// Mock secure-fs for JSONL persistence tests
const mockSecureFs = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  mkdir: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
}));

vi.mock('../../../src/lib/secure-fs.js', () => mockSecureFs);

vi.mock('@automaker/platform', () => ({
  getAutomakerDir: vi.fn((p: string) => `${p}/.automaker`),
}));

describe('recovery-service.ts', () => {
  let service: RecoveryService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  const makeErrorInfo = (overrides: Partial<ErrorInfo> = {}): ErrorInfo => ({
    type: 'execution',
    message: 'Test error',
    isAbort: false,
    isAuth: false,
    isCancellation: false,
    isRateLimit: false,
    isQuotaExhausted: false,
    originalError: new Error('Test error'),
    ...overrides,
  });

  const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
    featureId: 'feature-1',
    projectPath: '/test/project',
    retryCount: 0,
    previousErrors: [],
    runningTime: 1000,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecoveryService(mockEvents as any);
  });

  describe('analyzeFailure', () => {
    it('should analyze rate limit errors and recommend pause_and_wait', async () => {
      const error = new Error('rate limit exceeded');
      const errorInfo = makeErrorInfo({
        message: 'rate limit exceeded',
        isRateLimit: true,
        type: 'rate_limit',
      });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('rate_limit');
      expect(analysis.recoveryStrategy.type).toBe('pause_and_wait');
      expect(analysis.isRetryable).toBe(true);
      expect(analysis.explanation).toContain('rate limit');
      expect(analysis.originalError).toBe('rate limit exceeded');
      expect(analysis.currentRetryCount).toBe(0);
    });

    it('should analyze transient errors and recommend retry', async () => {
      const error = new Error('connection timeout');
      const errorInfo = makeErrorInfo({ message: 'connection timeout' });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('transient');
      expect(analysis.recoveryStrategy.type).toBe('retry');
      expect(analysis.isRetryable).toBe(true);
    });

    it('should analyze test failures and recommend retry_with_context', async () => {
      const error = new Error('test failed');
      const errorInfo = makeErrorInfo({ message: 'test failed: 3 assertions failed' });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('test_failure');
      expect(analysis.recoveryStrategy.type).toBe('retry_with_context');
      expect(analysis.isRetryable).toBe(true);
    });

    it('should escalate test failures after max retries', async () => {
      const error = new Error('test failed');
      const errorInfo = makeErrorInfo({ message: 'test failed' });
      const context = makeContext({ retryCount: 3 });

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('test_failure');
      expect(analysis.recoveryStrategy.type).toBe('escalate_to_user');
      expect(analysis.isRetryable).toBe(false);
    });

    it('should analyze authentication errors and escalate', async () => {
      const error = new Error('authentication failed');
      const errorInfo = makeErrorInfo({
        message: 'authentication failed',
        isAuth: true,
        type: 'authentication',
      });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('authentication');
      expect(analysis.recoveryStrategy.type).toBe('escalate_to_user');
      expect(analysis.isRetryable).toBe(false);
    });

    it('should analyze quota errors and escalate', async () => {
      const error = new Error('quota exhausted');
      const errorInfo = makeErrorInfo({
        message: 'quota exhausted',
        isQuotaExhausted: true,
        type: 'quota_exhausted',
      });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('quota');
      expect(analysis.recoveryStrategy.type).toBe('escalate_to_user');
      expect(analysis.isRetryable).toBe(false);
    });

    it('should analyze merge conflicts and escalate', async () => {
      const error = new Error('merge conflict detected');
      const errorInfo = makeErrorInfo({ message: 'merge conflict detected' });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('merge_conflict');
      expect(analysis.recoveryStrategy.type).toBe('escalate_to_user');
      expect(analysis.isRetryable).toBe(false);
    });

    it('should analyze dependency errors and recommend retry_with_context', async () => {
      const error = new Error('Cannot find module lodash');
      const errorInfo = makeErrorInfo({ message: 'Cannot find module lodash' });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('dependency');
      expect(analysis.recoveryStrategy.type).toBe('retry_with_context');
      expect(analysis.isRetryable).toBe(true);
    });

    it('should analyze tool errors and recommend alternative_approach', async () => {
      const error = new Error('tool error: command failed');
      const errorInfo = makeErrorInfo({ message: 'tool error: command failed' });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('tool_error');
      expect(analysis.recoveryStrategy.type).toBe('alternative_approach');
      expect(analysis.isRetryable).toBe(true);
    });

    it('should analyze validation errors and escalate', async () => {
      const error = new Error('invalid configuration');
      const errorInfo = makeErrorInfo({ message: 'invalid configuration' });
      const context = makeContext();

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('validation');
      expect(analysis.recoveryStrategy.type).toBe('escalate_to_user');
      expect(analysis.isRetryable).toBe(false);
    });

    it('should classify unknown errors and attempt retry_with_context', async () => {
      const error = new Error('something unexpected happened');
      const errorInfo = makeErrorInfo({ message: 'something unexpected happened' });
      const context = makeContext({
        retryCount: 0,
        previousErrors: ['something unexpected happened'],
      });

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('unknown');
      expect(analysis.recoveryStrategy.type).toBe('retry_with_context');
      expect(analysis.isRetryable).toBe(true);
    });

    it('should mark unknown errors as not retryable after max retries', async () => {
      const error = new Error('something unexpected');
      const errorInfo = makeErrorInfo({ message: 'something unexpected' });
      const context = makeContext({ retryCount: 5 });

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.category).toBe('unknown');
      expect(analysis.isRetryable).toBe(false);
    });

    it('should emit recovery_analysis event', async () => {
      const error = new Error('test error');
      const errorInfo = makeErrorInfo();
      const context = makeContext();

      await service.analyzeFailure(error, errorInfo, context);

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_analysis', {
        featureId: 'feature-1',
        projectPath: '/test/project',
        analysis: expect.objectContaining({
          category: expect.any(String),
          isRetryable: expect.any(Boolean),
          currentRetryCount: 0,
          maxRetries: expect.any(Number),
          explanation: expect.any(String),
        }),
      });
    });

    it('should preserve context from previous errors', async () => {
      const error = new Error('test failed again');
      const errorInfo = makeErrorInfo({ message: 'test failed again' });
      const context = makeContext({
        previousErrors: ['first error', 'second error'],
      });

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.contextToPreserve).toEqual(
        expect.arrayContaining(['first error', 'second error'])
      );
    });

    it('should not preserve context when disabled in config', async () => {
      const customService = new RecoveryService(mockEvents as any, { preserveContext: false });
      const error = new Error('test failed');
      const errorInfo = makeErrorInfo({ message: 'test failed' });
      const context = makeContext({ previousErrors: ['prev error'] });

      const analysis = await customService.analyzeFailure(error, errorInfo, context);

      expect(analysis.contextToPreserve).toEqual([]);
    });

    it('should calculate exponential backoff for delay', async () => {
      const error = new Error('timeout');
      const errorInfo = makeErrorInfo({ message: 'timeout' });

      const analysis0 = await service.analyzeFailure(
        error,
        errorInfo,
        makeContext({ retryCount: 0 })
      );
      const analysis1 = await service.analyzeFailure(
        error,
        errorInfo,
        makeContext({ retryCount: 1 })
      );
      const analysis2 = await service.analyzeFailure(
        error,
        errorInfo,
        makeContext({ retryCount: 2 })
      );

      expect(analysis1.suggestedDelay).toBeGreaterThan(analysis0.suggestedDelay);
      expect(analysis2.suggestedDelay).toBeGreaterThan(analysis1.suggestedDelay);
    });

    it('should cap delay at maxDelayMs', async () => {
      const error = new Error('timeout');
      const errorInfo = makeErrorInfo({ message: 'timeout' });
      const context = makeContext({ retryCount: 100 });

      const analysis = await service.analyzeFailure(error, errorInfo, context);

      expect(analysis.suggestedDelay).toBeLessThanOrEqual(DEFAULT_RECOVERY_CONFIG.maxDelayMs);
    });

    it('should not be retryable when recovery is disabled', async () => {
      const disabledService = new RecoveryService(mockEvents as any, { enabled: false });
      const error = new Error('timeout');
      const errorInfo = makeErrorInfo({ message: 'timeout' });
      const context = makeContext();

      const analysis = await disabledService.analyzeFailure(error, errorInfo, context);

      expect(analysis.isRetryable).toBe(false);
    });
  });

  describe('executeRecovery', () => {
    it('should execute retry strategy', async () => {
      const analysis: FailureAnalysis = {
        category: 'transient',
        isRetryable: true,
        suggestedDelay: 1000,
        maxRetries: 3,
        recoveryStrategy: { type: 'retry', delay: 1000 },
        contextToPreserve: [],
        explanation: 'Transient error',
        originalError: 'timeout',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.actionTaken).toContain('retry');
    });

    it('should execute retry_with_context strategy', async () => {
      const analysis: FailureAnalysis = {
        category: 'test_failure',
        isRetryable: true,
        suggestedDelay: 1000,
        maxRetries: 2,
        recoveryStrategy: {
          type: 'retry_with_context',
          context: 'Tests failed - fix the assertions',
          delay: 1000,
        },
        contextToPreserve: ['previous error output'],
        explanation: 'Test failure',
        originalError: 'test failed',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.retryContext).toContain('Tests failed');
    });

    it('should execute escalate_to_user strategy', async () => {
      const analysis: FailureAnalysis = {
        category: 'authentication',
        isRetryable: false,
        suggestedDelay: 0,
        maxRetries: 0,
        recoveryStrategy: {
          type: 'escalate_to_user',
          reason: 'Authentication failed',
        },
        contextToPreserve: [],
        explanation: 'Auth error',
        originalError: 'auth failed',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(false);
      expect(result.failureReason).toBe('Authentication failed');
    });

    it('should execute pause_and_wait strategy', async () => {
      const analysis: FailureAnalysis = {
        category: 'rate_limit',
        isRetryable: true,
        suggestedDelay: 5000,
        maxRetries: 3,
        recoveryStrategy: {
          type: 'pause_and_wait',
          duration: 5000,
          reason: 'Rate limit reached',
        },
        contextToPreserve: [],
        explanation: 'Rate limit',
        originalError: 'rate limited',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.actionTaken).toContain('5000ms');
    });

    it('should execute alternative_approach strategy', async () => {
      const analysis: FailureAnalysis = {
        category: 'tool_error',
        isRetryable: true,
        suggestedDelay: 1000,
        maxRetries: 2,
        recoveryStrategy: {
          type: 'alternative_approach',
          suggestion: 'Try a different command',
        },
        contextToPreserve: [],
        explanation: 'Tool error',
        originalError: 'tool failed',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.retryContext).toContain('different command');
    });

    it('should execute rollback_and_retry strategy', async () => {
      const analysis: FailureAnalysis = {
        category: 'unknown',
        isRetryable: true,
        suggestedDelay: 1000,
        maxRetries: 3,
        recoveryStrategy: { type: 'rollback_and_retry' },
        contextToPreserve: [],
        explanation: 'Unknown error',
        originalError: 'something went wrong',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.actionTaken).toContain('Rolled back');
    });

    it('should emit recovery_started and recovery_completed events', async () => {
      const analysis: FailureAnalysis = {
        category: 'transient',
        isRetryable: true,
        suggestedDelay: 1000,
        maxRetries: 3,
        recoveryStrategy: { type: 'retry', delay: 1000 },
        contextToPreserve: [],
        explanation: 'Transient error',
        originalError: 'timeout',
        currentRetryCount: 1,
      };

      await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_started', {
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        retryCount: 1,
      });
      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_completed', {
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        success: true,
        shouldRetry: true,
        actionTaken: expect.any(String),
      });
    });

    it('should emit recovery_escalated event for escalate_to_user', async () => {
      const analysis: FailureAnalysis = {
        category: 'quota',
        isRetryable: false,
        suggestedDelay: 0,
        maxRetries: 0,
        recoveryStrategy: {
          type: 'escalate_to_user',
          reason: 'Quota exhausted',
        },
        contextToPreserve: [],
        explanation: 'Quota error',
        originalError: 'quota exceeded',
        currentRetryCount: 0,
      };

      await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_escalated', {
        featureId: 'feature-1',
        reason: 'Quota exhausted',
        timestamp: expect.any(String),
      });
    });

    it('should handle unknown strategy type gracefully', async () => {
      const analysis: FailureAnalysis = {
        category: 'unknown',
        isRetryable: false,
        suggestedDelay: 0,
        maxRetries: 0,
        recoveryStrategy: { type: 'nonexistent' as any } as any,
        contextToPreserve: [],
        explanation: 'Unknown',
        originalError: 'error',
        currentRetryCount: 0,
      };

      const result = await service.executeRecovery('feature-1', analysis, '/test/project');

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(false);
      expect(result.failureReason).toContain('Unknown recovery strategy');
    });
  });

  describe('recordRecoveryAttempt', () => {
    it('should emit recovery_recorded event', async () => {
      const strategy = { type: 'retry' as const, delay: 1000 };

      await service.recordRecoveryAttempt('feature-1', strategy, true, '/test/project');

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_recorded', {
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry',
        success: true,
        timestamp: expect.any(String),
      });
    });

    it('should record failed attempts', async () => {
      const strategy = { type: 'retry_with_context' as const, context: 'ctx', delay: 1000 };

      await service.recordRecoveryAttempt('feature-1', strategy, false, '/test/project');

      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_recorded', {
        featureId: 'feature-1',
        projectPath: '/test/project',
        strategy: 'retry_with_context',
        success: false,
        timestamp: expect.any(String),
      });
    });
  });

  describe('config management', () => {
    it('should use default config when none provided', () => {
      const config = service.getConfig();

      expect(config).toEqual(DEFAULT_RECOVERY_CONFIG);
    });

    it('should merge custom config with defaults', () => {
      const customService = new RecoveryService(mockEvents as any, {
        maxTransientRetries: 5,
        baseDelayMs: 2000,
      });

      const config = customService.getConfig();

      expect(config.maxTransientRetries).toBe(5);
      expect(config.baseDelayMs).toBe(2000);
      expect(config.enabled).toBe(true); // default preserved
      expect(config.preserveContext).toBe(true); // default preserved
    });

    it('should update config dynamically', () => {
      service.updateConfig({ maxTestFailureRetries: 5 });

      const config = service.getConfig();

      expect(config.maxTestFailureRetries).toBe(5);
      expect(config.enabled).toBe(true); // unchanged
    });

    it('should return a copy of config (not reference)', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('getRecoveryService', () => {
    it('should return singleton instance', () => {
      const instance1 = getRecoveryService(mockEvents as any);
      const instance2 = getRecoveryService(mockEvents as any);

      expect(instance1).toBe(instance2);
    });
  });

  describe('createRecoveryService', () => {
    it('should create new instance each time', () => {
      const instance1 = createRecoveryService(mockEvents as any);
      const instance2 = createRecoveryService(mockEvents as any);

      expect(instance1).not.toBe(instance2);
    });

    it('should accept custom config', () => {
      const instance = createRecoveryService(mockEvents as any, {
        maxTransientRetries: 10,
      });

      expect(instance.getConfig().maxTransientRetries).toBe(10);
    });
  });

  describe('JSONL persistence', () => {
    beforeEach(() => {
      mockSecureFs.existsSync.mockReturnValue(false);
      mockSecureFs.mkdir.mockResolvedValue(undefined);
      mockSecureFs.appendFile.mockResolvedValue(undefined);
      mockSecureFs.readFile.mockResolvedValue('');
      mockSecureFs.writeFile.mockResolvedValue(undefined);
    });

    it('recordRecoveryAttempt writes JSONL line with extra fields', async () => {
      const strategy = { type: 'retry' as const, delay: 1000 };

      await service.recordRecoveryAttempt('feature-1', strategy, false, '/test/project', {
        category: 'test_failure',
        explanation: 'Tests failed',
        errorMessage: 'vitest failed',
      });

      expect(mockSecureFs.mkdir).toHaveBeenCalled();
      expect(mockSecureFs.appendFile).toHaveBeenCalledWith(
        '/test/project/.automaker/recovery/failures.jsonl',
        expect.stringContaining('"category":"test_failure"')
      );

      // Verify the written line is valid JSON
      const writtenLine = mockSecureFs.appendFile.mock.calls[0][1] as string;
      expect(writtenLine.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(writtenLine.trim()) as RecoveryRecord;
      expect(parsed.featureId).toBe('feature-1');
      expect(parsed.strategyType).toBe('retry');
      expect(parsed.success).toBe(false);
      expect(parsed.category).toBe('test_failure');
      expect(parsed.errorMessage).toBe('vitest failed');
    });

    it('readRecoveryLog parses JSONL correctly', async () => {
      const records: RecoveryRecord[] = [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          featureId: 'f1',
          projectPath: '/test/project',
          category: 'test_failure',
          strategyType: 'retry',
          success: false,
          errorMessage: 'test failed',
        },
        {
          timestamp: '2026-01-01T00:01:00.000Z',
          featureId: 'f2',
          projectPath: '/test/project',
          category: 'transient',
          strategyType: 'retry',
          success: true,
        },
      ];

      mockSecureFs.existsSync.mockReturnValue(true);
      mockSecureFs.readFile.mockResolvedValue(
        records.map((r) => JSON.stringify(r)).join('\n') + '\n'
      );

      const result = await service.readRecoveryLog('/test/project');

      expect(result).toHaveLength(2);
      expect(result[0].featureId).toBe('f1');
      expect(result[0].category).toBe('test_failure');
      expect(result[1].featureId).toBe('f2');
      expect(result[1].success).toBe(true);
    });

    it('readRecoveryLog returns empty array when file does not exist', async () => {
      mockSecureFs.existsSync.mockReturnValue(false);

      const result = await service.readRecoveryLog('/test/project');

      expect(result).toEqual([]);
    });

    it('checkAndGenerateLessons triggers after 3+ failures of same category', async () => {
      const records: RecoveryRecord[] = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          featureId: 'f1',
          projectPath: '/p',
          category: 'test_failure',
          strategyType: 'retry',
          success: false,
          errorMessage: 'assertion failed',
        },
        {
          timestamp: '2026-01-01T00:01:00Z',
          featureId: 'f2',
          projectPath: '/p',
          category: 'test_failure',
          strategyType: 'retry_with_context',
          success: false,
          errorMessage: 'vitest error',
        },
        {
          timestamp: '2026-01-01T00:02:00Z',
          featureId: 'f3',
          projectPath: '/p',
          category: 'test_failure',
          strategyType: 'retry',
          success: true,
        },
      ];

      mockSecureFs.existsSync.mockReturnValue(true);
      mockSecureFs.readFile.mockResolvedValue(
        records.map((r) => JSON.stringify(r)).join('\n') + '\n'
      );

      await service.checkAndGenerateLessons('/test/project', 'test_failure');

      // Should write a context file
      expect(mockSecureFs.writeFile).toHaveBeenCalledWith(
        '/test/project/.automaker/context/failure-lessons-test_failure.md',
        expect.stringContaining('# Failure Lessons: test_failure')
      );

      // Should emit event
      expect(mockEvents.emit).toHaveBeenCalledWith('recovery_lesson_generated', {
        projectPath: '/test/project',
        category: 'test_failure',
        totalAttempts: 3,
        successRate: 33,
      });
    });

    it('checkAndGenerateLessons does NOT trigger with fewer than 3 failures', async () => {
      const records: RecoveryRecord[] = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          featureId: 'f1',
          projectPath: '/p',
          category: 'test_failure',
          strategyType: 'retry',
          success: false,
        },
        {
          timestamp: '2026-01-01T00:01:00Z',
          featureId: 'f2',
          projectPath: '/p',
          category: 'transient',
          strategyType: 'retry',
          success: false,
        },
      ];

      mockSecureFs.existsSync.mockReturnValue(true);
      mockSecureFs.readFile.mockResolvedValue(
        records.map((r) => JSON.stringify(r)).join('\n') + '\n'
      );

      await service.checkAndGenerateLessons('/test/project', 'test_failure');

      // Should NOT write a context file (only 1 test_failure record)
      expect(mockSecureFs.writeFile).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalledWith(
        'recovery_lesson_generated',
        expect.anything()
      );
    });
  });
});
