/**
 * Unit tests for GraphiteService retry logic and circuit breaker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphiteService } from '@/services/graphite-service.js';

// Mock child_process module
const mockExec = vi.fn();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: mockExec,
  };
});

describe('GraphiteService Retry and Circuit Breaker', () => {
  let graphiteService: GraphiteService;

  beforeEach(() => {
    graphiteService = new GraphiteService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeWithRetry - Success Cases', () => {
    it('should succeed on first attempt when command works', async () => {
      // Mock successful exec call
      mockExec.mockImplementationOnce((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      // Call sync which uses executeWithRetry internally
      const result = await graphiteService.sync('/fake/workdir');

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(1);
    });

    it('should succeed on second attempt after one failure', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce({
          stdout: 'success',
          stderr: '',
        });

      const result = await graphiteService.sync('/fake/workdir');

      expect(result.success).toBe(true);
      // Should have tried twice (1 failure + 1 success)
      expect(mockExec).toHaveBeenCalledTimes(2);
    });

    it('should succeed on third attempt after two failures', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({
          stdout: 'success',
          stderr: '',
        });

      const result = await graphiteService.sync('/fake/workdir');

      expect(result.success).toBe(true);
      // Should have tried 3 times (2 failures + 1 success)
      expect(mockExec).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeWithRetry - Failure Cases', () => {
    it('should fail after max retries (3 attempts)', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'));

      const result = await graphiteService.sync('/fake/workdir');

      expect(result.success).toBe(false);
      expect(mockExec).toHaveBeenCalledTimes(3);
    });

    it('should detect merge conflicts without retrying', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec.mockRejectedValueOnce(new Error('CONFLICT: merge conflict detected'));

      const result = await graphiteService.sync('/fake/workdir');

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
      // Should not retry on conflicts
      expect(mockExec).toHaveBeenCalledTimes(1);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after 3 consecutive failures', async () => {
      const mockExec = vi.mocked(execAsync);

      // First 3 failures should try normally
      mockExec
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'));

      const result1 = await graphiteService.sync('/fake/workdir');
      expect(result1.success).toBe(false);
      expect(mockExec).toHaveBeenCalledTimes(3);

      // Reset mock call count
      mockExec.mockClear();

      // Next call should be blocked by circuit breaker
      mockExec.mockRejectedValueOnce(new Error('Should not reach'));

      const result2 = await graphiteService.sync('/fake/workdir');
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('circuit breaker is open');
      // Should NOT call execAsync when circuit is open
      expect(mockExec).toHaveBeenCalledTimes(0);
    });

    it('should reset circuit breaker after successful operation', async () => {
      const mockExec = vi.mocked(execAsync);

      // 2 failures (not enough to open circuit)
      mockExec
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce({ stdout: 'success', stderr: '' });

      const result1 = await graphiteService.sync('/fake/workdir');
      expect(result1.success).toBe(true);

      mockExec.mockClear();

      // Next call should work normally (circuit reset)
      mockExec.mockResolvedValueOnce({ stdout: 'success', stderr: '' });

      const result2 = await graphiteService.sync('/fake/workdir');
      expect(result2.success).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(1);
    });
  });

  describe('Exponential Backoff', () => {
    it('should wait between retry attempts', async () => {
      const mockExec = vi.mocked(execAsync);
      const sleepSpy = vi.spyOn(global, 'setTimeout');

      mockExec
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValueOnce({ stdout: 'success', stderr: '' });

      await graphiteService.sync('/fake/workdir');

      // Should have called setTimeout for backoff
      expect(sleepSpy).toHaveBeenCalled();
    });
  });

  describe('Restack with Retry', () => {
    it('should retry restack command', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ stdout: 'success', stderr: '' });

      const result = await graphiteService.restack('/fake/workdir');

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(2);
    });

    it('should detect conflicts in restack without retrying', async () => {
      const mockExec = vi.mocked(execAsync);
      mockExec.mockRejectedValueOnce(new Error('conflict detected during restack'));

      const result = await graphiteService.restack('/fake/workdir');

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(1);
    });
  });
});
