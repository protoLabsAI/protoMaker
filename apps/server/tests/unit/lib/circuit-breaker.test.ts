/**
 * Unit tests for CircuitBreaker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '@/lib/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 300000, // 5 minutes
      name: 'TestService',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should start with circuit closed', () => {
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
    });

    it('should have zero failures initially', () => {
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should return correct initial state', () => {
      const state = circuitBreaker.getState();
      expect(state.isOpen).toBe(false);
      expect(state.failureCount).toBe(0);
      expect(state.timeSinceLastFailure).toBe(0);
    });
  });

  describe('Failure Tracking', () => {
    it('should increment failure count on recordFailure', () => {
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getFailureCount()).toBe(1);

      circuitBreaker.recordFailure();
      expect(circuitBreaker.getFailureCount()).toBe(2);
    });

    it('should keep circuit closed below threshold', () => {
      for (let i = 0; i < 4; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getFailureCount()).toBe(4);
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
    });

    it('should open circuit at threshold (5 failures)', () => {
      for (let i = 0; i < 4; i++) {
        const opened = circuitBreaker.recordFailure();
        expect(opened).toBe(false);
      }

      const opened = circuitBreaker.recordFailure();
      expect(opened).toBe(true);
      expect(circuitBreaker.isCircuitOpen()).toBe(true);
      expect(circuitBreaker.getFailureCount()).toBe(5);
    });

    it('should not re-open circuit if already open', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.isCircuitOpen()).toBe(true);

      // Additional failures should not re-trigger opening
      const opened = circuitBreaker.recordFailure();
      expect(opened).toBe(false);
      expect(circuitBreaker.getFailureCount()).toBe(6);
    });
  });

  describe('Success Recovery', () => {
    it('should reset failure count on success', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getFailureCount()).toBe(2);

      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getFailureCount()).toBe(0);
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
    });

    it('should close circuit on success', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.isCircuitOpen()).toBe(true);

      // Success should close it
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('Cooldown Period', () => {
    it('should auto-reset after cooldown period', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.isCircuitOpen()).toBe(true);

      // Advance time by cooldown period (5 minutes)
      vi.advanceTimersByTime(300000);

      // Circuit should auto-reset
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should remain open during cooldown period', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.isCircuitOpen()).toBe(true);

      // Advance time by less than cooldown (4 minutes)
      vi.advanceTimersByTime(240000);

      // Circuit should still be open
      expect(circuitBreaker.isCircuitOpen()).toBe(true);
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit manually', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getFailureCount()).toBe(2);

      circuitBreaker.reset();
      expect(circuitBreaker.getFailureCount()).toBe(0);
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
    });

    it('should close open circuit on manual reset', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.isCircuitOpen()).toBe(true);

      circuitBreaker.reset();
      expect(circuitBreaker.isCircuitOpen()).toBe(false);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('Backoff Detection', () => {
    it('should trigger backoff at 3 failures', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.shouldBackoff(3)).toBe(false);

      circuitBreaker.recordFailure();
      expect(circuitBreaker.shouldBackoff(3)).toBe(true);
    });

    it('should not backoff when circuit is open', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.isCircuitOpen()).toBe(true);
      expect(circuitBreaker.shouldBackoff(3)).toBe(false);
    });

    it('should use custom backoff threshold', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.shouldBackoff(2)).toBe(true);
      expect(circuitBreaker.shouldBackoff(3)).toBe(false);
    });
  });

  describe('State Monitoring', () => {
    it('should return current state snapshot', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      const state = circuitBreaker.getState();
      expect(state.isOpen).toBe(false);
      expect(state.failureCount).toBe(2);
      expect(state.timeSinceLastFailure).toBeGreaterThanOrEqual(0);
    });

    it('should track time since last failure', () => {
      circuitBreaker.recordFailure();

      vi.advanceTimersByTime(5000); // 5 seconds

      const state = circuitBreaker.getState();
      expect(state.timeSinceLastFailure).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-threshold configuration', () => {
      const zeroThresholdBreaker = new CircuitBreaker({
        failureThreshold: 0,
        cooldownMs: 1000,
        name: 'ZeroThreshold',
      });

      // Should open immediately on first failure
      const opened = zeroThresholdBreaker.recordFailure();
      expect(opened).toBe(true);
      expect(zeroThresholdBreaker.isCircuitOpen()).toBe(true);
    });

    it('should handle very short cooldown', () => {
      const shortCooldownBreaker = new CircuitBreaker({
        failureThreshold: 2,
        cooldownMs: 100,
        name: 'ShortCooldown',
      });

      shortCooldownBreaker.recordFailure();
      shortCooldownBreaker.recordFailure();
      expect(shortCooldownBreaker.isCircuitOpen()).toBe(true);

      vi.advanceTimersByTime(100);
      expect(shortCooldownBreaker.isCircuitOpen()).toBe(false);
    });

    it('should handle rapid failure-success cycles', () => {
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
        circuitBreaker.recordFailure();
        circuitBreaker.recordSuccess();
      }

      expect(circuitBreaker.isCircuitOpen()).toBe(false);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });
});
