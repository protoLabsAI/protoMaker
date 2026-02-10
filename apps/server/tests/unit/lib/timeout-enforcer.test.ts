/**
 * Unit tests for timeout enforcer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withTimeout,
  getTimeoutForComplexity,
  isTimeoutError,
  createTimeoutWrapper,
} from '../../../src/lib/timeout-enforcer.js';

describe('TimeoutEnforcer', () => {
  describe('getTimeoutForComplexity', () => {
    it('should return correct timeout values for each complexity level', () => {
      expect(getTimeoutForComplexity('small')).toBe(300_000); // 5 minutes
      expect(getTimeoutForComplexity('medium')).toBe(600_000); // 10 minutes
      expect(getTimeoutForComplexity('large')).toBe(900_000); // 15 minutes
      expect(getTimeoutForComplexity('architectural')).toBe(1_200_000); // 20 minutes
      expect(getTimeoutForComplexity()).toBe(600_000); // default to medium
    });
  });

  describe('withTimeout', () => {
    it('should complete operation within timeout', async () => {
      const result = await withTimeout(
        async (signal) => {
          // Simulate quick operation
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success';
        },
        {
          operationId: 'test-quick-op',
          complexity: 'small',
          timeoutMs: 1000,
        }
      );

      expect(result).toBe('success');
    });

    it('should abort operation on timeout', async () => {
      const startTime = Date.now();

      await expect(
        withTimeout(
          async (signal) => {
            // Simulate long operation
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return 'should-not-complete';
          },
          {
            operationId: 'test-timeout-op',
            complexity: 'small',
            timeoutMs: 100, // Very short timeout
          }
        )
      ).rejects.toThrow('timed out');

      const elapsed = Date.now() - startTime;

      // Verify timeout happened roughly at the right time (generous tolerance for CI)
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(500);
    });

    it('should respect abort signal during operation', async () => {
      let iterationCount = 0;

      await expect(
        withTimeout(
          async (signal) => {
            // Check abort signal during operation
            for (let i = 0; i < 100; i++) {
              if (signal.aborted) {
                // Stop if aborted (good practice for operations)
                break;
              }
              iterationCount++;
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            return 'should-not-complete';
          },
          {
            operationId: 'test-abort-signal',
            timeoutMs: 50,
          }
        )
      ).rejects.toThrow('timed out');

      // Verify operation was interrupted (didn't complete all iterations)
      // With 50ms timeout and 10ms per iteration, should complete ~5 iterations
      expect(iterationCount).toBeLessThan(100);
      expect(iterationCount).toBeGreaterThanOrEqual(0);
    });

    it('should emit timeout event when available', async () => {
      const events: Array<{ type: string; payload: unknown }> = [];

      const mockEmitter = {
        emit: (type: string, payload: unknown) => {
          events.push({ type, payload });
        },
        subscribe: () => () => {},
      };

      await expect(
        withTimeout(
          async (signal) => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return 'should-not-complete';
          },
          {
            operationId: 'test-event-emission',
            complexity: 'medium',
            timeoutMs: 100,
            events: mockEmitter,
            metadata: { test: true },
          }
        )
      ).rejects.toThrow();

      // Verify timeout event was emitted
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('agent:timeout');

      const payload = events[0].payload as any;
      expect(payload.operationId).toBe('test-event-emission');
      expect(payload.complexity).toBe('medium');
      expect(payload.timeoutMs).toBe(100);
      expect(payload.metadata).toEqual({ test: true });
    });

    it('should handle non-timeout errors correctly', async () => {
      const testError = new Error('Custom error');

      await expect(
        withTimeout(
          async (signal) => {
            throw testError;
          },
          {
            operationId: 'test-error-handling',
            timeoutMs: 1000,
          }
        )
      ).rejects.toThrow('Custom error');
    });
  });

  describe('isTimeoutError', () => {
    it('should identify timeout errors', async () => {
      try {
        await withTimeout(
          async (signal) => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return 'should-not-complete';
          },
          {
            operationId: 'test-is-timeout-error',
            timeoutMs: 100,
          }
        );
      } catch (error) {
        expect(isTimeoutError(error)).toBe(true);
      }
    });

    it('should not identify non-timeout errors', () => {
      const regularError = new Error('Regular error');
      expect(isTimeoutError(regularError)).toBe(false);
    });
  });

  describe('createTimeoutWrapper', () => {
    it('should create a reusable wrapper function', async () => {
      const mockEmitter = {
        emit: vi.fn(),
        subscribe: () => () => {},
      };

      const wrapper = createTimeoutWrapper(mockEmitter);

      const result = await wrapper(
        async (signal) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'wrapped-success';
        },
        {
          operationId: 'test-wrapper',
          complexity: 'small',
        }
      );

      expect(result).toBe('wrapped-success');
    });

    it('should handle timeouts with wrapper', async () => {
      const wrapper = createTimeoutWrapper();

      await expect(
        wrapper(
          async (signal) => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return 'should-not-complete';
          },
          {
            operationId: 'test-wrapper-timeout',
            timeoutMs: 100,
          }
        )
      ).rejects.toThrow('timed out');
    });
  });
});
