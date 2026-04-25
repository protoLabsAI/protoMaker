/**
 * Unit tests for AgentCircuitBreakerManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentCircuitBreakerManager } from '@/lib/goap/agent-circuit-breaker.js';

describe('AgentCircuitBreakerManager', () => {
  let manager: AgentCircuitBreakerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AgentCircuitBreakerManager({
      circuitBreakerThreshold: 5,
      circuitBreakerCooldownMs: 300_000, // 5 min
      agentClassThresholds: {
        critical: 8,
        'non-critical': 3,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start with circuit closed for any agent', () => {
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(false);
    });

    it('should lazily create breakers', () => {
      expect(manager.getAllAgentStates()).toHaveLength(0);
      manager.isAgentCircuitOpen('agent-1');
      expect(manager.getAllAgentStates()).toHaveLength(1);
    });
  });

  describe('failure tracking', () => {
    it('should open circuit after threshold failures', () => {
      for (let i = 0; i < 4; i++) {
        const result = manager.recordAgentFailure('agent-1');
        expect(result.circuitOpened).toBe(false);
      }

      const result = manager.recordAgentFailure('agent-1');
      expect(result.circuitOpened).toBe(true);
      expect(result.state).toBe('OPEN');
      expect(result.failureCount).toBe(5);
    });

    it('should track agents independently', () => {
      // Fail agent-1 to threshold
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }

      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);
      expect(manager.isAgentCircuitOpen('agent-2')).toBe(false);
    });
  });

  describe('per-agent-class thresholds', () => {
    it('should use critical threshold (8) for critical agents', () => {
      for (let i = 0; i < 7; i++) {
        expect(manager.recordAgentFailure('critical-agent-1').circuitOpened).toBe(false);
      }
      expect(manager.recordAgentFailure('critical-agent-1').circuitOpened).toBe(true);
    });

    it('should use non-critical threshold (3) for non-critical agents', () => {
      for (let i = 0; i < 2; i++) {
        expect(manager.recordAgentFailure('non-critical-agent-1').circuitOpened).toBe(false);
      }
      expect(manager.recordAgentFailure('non-critical-agent-1').circuitOpened).toBe(true);
    });

    it('should use default threshold for unmatched agents', () => {
      for (let i = 0; i < 4; i++) {
        expect(manager.recordAgentFailure('regular-agent').circuitOpened).toBe(false);
      }
      expect(manager.recordAgentFailure('regular-agent').circuitOpened).toBe(true);
    });
  });

  describe('success recovery', () => {
    it('should close circuit on success', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);

      manager.recordAgentSuccess('agent-1');
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(false);
    });

    it('should report CLOSED state after recovery', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      manager.recordAgentSuccess('agent-1');

      const state = manager.getAgentState('agent-1');
      expect(state.state).toBe('CLOSED');
      expect(state.consecutiveFailures).toBe(0);
    });
  });

  describe('cooldown auto-reset', () => {
    it('should auto-reset after cooldown period', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);

      vi.advanceTimersByTime(300_000); // 5 min
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(false);
    });

    it('should remain open during cooldown', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }

      vi.advanceTimersByTime(240_000); // 4 min
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);
    });
  });

  describe('admin override', () => {
    it('should bypass circuit breaker when override is set', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);

      manager.setAdminOverride('agent-1', true);
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(false);
    });

    it('should re-enable circuit breaker when override is removed', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      manager.setAdminOverride('agent-1', true);
      manager.setAdminOverride('agent-1', false);

      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);
    });
  });

  describe('manual reset', () => {
    it('should reset specific agent circuit', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      manager.resetAgent('agent-1');
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(false);
      expect(manager.getAgentState('agent-1').consecutiveFailures).toBe(0);
    });
  });

  describe('getOpenCircuits', () => {
    it('should return only agents with open circuits', () => {
      // Open circuit for agent-1
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }
      // agent-2 has failures but below threshold
      manager.recordAgentFailure('agent-2');
      manager.recordAgentFailure('agent-2');

      const open = manager.getOpenCircuits();
      expect(open).toHaveLength(1);
      expect(open[0].agentId).toBe('agent-1');
    });
  });

  describe('auto-pause routing after N consecutive failures', () => {
    it('should block routing after opening', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordAgentFailure('agent-1');
      }

      // This simulates the GOAP dispatcher checking before routing
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);
    });

    it('should track consecutive failures accurately across multiple agents', () => {
      // Interleaved failures across agents
      manager.recordAgentFailure('agent-1');
      manager.recordAgentFailure('agent-2');
      manager.recordAgentFailure('agent-1');
      manager.recordAgentFailure('agent-2');
      manager.recordAgentFailure('agent-1');

      // agent-1 has 3 failures, agent-2 has 2 — neither should be open (threshold: 5)
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(false);
      expect(manager.isAgentCircuitOpen('agent-2')).toBe(false);

      // Push agent-1 to threshold
      manager.recordAgentFailure('agent-1');
      manager.recordAgentFailure('agent-1');
      expect(manager.isAgentCircuitOpen('agent-1')).toBe(true);
      expect(manager.isAgentCircuitOpen('agent-2')).toBe(false);
    });
  });
});
