/**
 * Agent Circuit Breaker Manager — per-agent circuit breaker for GOAP dispatch routing.
 *
 * Manages a pool of circuit breakers keyed by agentId. Each agent gets its own
 * breaker with configurable thresholds (supports per-agent-class overrides).
 * Tracks CLOSED -> OPEN -> HALF_OPEN state transitions with exponential backoff.
 */

import { createLogger } from '@protolabsai/utils';
import { CircuitBreaker, type CircuitBreakerState } from '../circuit-breaker.js';
import { DEFAULT_GOAP_CONFIG, type GoapFeedbackLoopConfig } from './goap-config.js';

const logger = createLogger('AgentCircuitBreaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface AgentCircuitState extends CircuitBreakerState {
  agentId: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastTransitionAt: number;
  halfOpenProbeCount: number;
}

export interface AgentFailureResult {
  circuitOpened: boolean;
  state: CircuitState;
  failureCount: number;
}

export class AgentCircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  private halfOpenProbes = new Map<string, number>();
  private transitionTimes = new Map<string, number>();
  private adminOverrides = new Set<string>();
  private readonly defaultThreshold: number;
  private readonly cooldownMs: number;
  private readonly agentClassThresholds: Record<string, number>;

  constructor(config?: Partial<GoapFeedbackLoopConfig>) {
    this.defaultThreshold =
      config?.circuitBreakerThreshold ?? DEFAULT_GOAP_CONFIG.circuitBreakerThreshold;
    this.cooldownMs =
      config?.circuitBreakerCooldownMs ?? DEFAULT_GOAP_CONFIG.circuitBreakerCooldownMs;
    this.agentClassThresholds =
      config?.agentClassThresholds ?? DEFAULT_GOAP_CONFIG.agentClassThresholds;
  }

  /**
   * Get or create a circuit breaker for an agent.
   */
  private getBreaker(agentId: string): CircuitBreaker {
    let breaker = this.breakers.get(agentId);
    if (!breaker) {
      const threshold = this.getThresholdForAgent(agentId);
      breaker = new CircuitBreaker({
        failureThreshold: threshold,
        cooldownMs: this.cooldownMs,
        name: `agent:${agentId}`,
      });
      this.breakers.set(agentId, breaker);
    }
    return breaker;
  }

  /**
   * Resolve threshold for an agent, checking agent-class overrides first.
   */
  private getThresholdForAgent(agentId: string): number {
    // Check if agentId matches any class pattern (prefix match)
    for (const [classPattern, threshold] of Object.entries(this.agentClassThresholds)) {
      if (agentId.startsWith(classPattern)) {
        return threshold;
      }
    }
    return this.defaultThreshold;
  }

  /**
   * Derive CLOSED/OPEN/HALF_OPEN state from the underlying breaker.
   */
  private deriveState(agentId: string, breaker: CircuitBreaker): CircuitState {
    if (!breaker.isCircuitOpen()) return 'CLOSED';
    const probeCount = this.halfOpenProbes.get(agentId) ?? 0;
    return probeCount > 0 ? 'HALF_OPEN' : 'OPEN';
  }

  /**
   * Check if routing to an agent is blocked.
   */
  isAgentCircuitOpen(agentId: string): boolean {
    // Admin override: always allow
    if (this.adminOverrides.has(agentId)) return false;

    const breaker = this.getBreaker(agentId);
    return breaker.isCircuitOpen();
  }

  /**
   * Record a successful dispatch to an agent. Resets the circuit.
   */
  recordAgentSuccess(agentId: string): void {
    const breaker = this.getBreaker(agentId);
    const wasOpen = breaker.isCircuitOpen();
    breaker.recordSuccess();
    this.halfOpenProbes.delete(agentId);

    if (wasOpen) {
      this.transitionTimes.set(agentId, Date.now());
      logger.info(`Agent "${agentId}" circuit CLOSED after successful dispatch`);
    }
  }

  /**
   * Record a failed dispatch to an agent. May open the circuit.
   */
  recordAgentFailure(agentId: string): AgentFailureResult {
    const breaker = this.getBreaker(agentId);
    const circuitOpened = breaker.recordFailure();

    if (circuitOpened) {
      this.transitionTimes.set(agentId, Date.now());
      logger.warn(
        `Agent "${agentId}" circuit OPENED after ${breaker.getFailureCount()} consecutive failures. ` +
          `Routing paused for ${this.cooldownMs / 1000}s.`
      );
    }

    return {
      circuitOpened,
      state: this.deriveState(agentId, breaker),
      failureCount: breaker.getFailureCount(),
    };
  }

  /**
   * Attempt a half-open probe for an agent. Increments probe count.
   * Returns true if the probe is allowed (circuit is in cooldown-expired state).
   */
  attemptHalfOpenProbe(agentId: string): boolean {
    const breaker = this.getBreaker(agentId);
    if (!breaker.isCircuitOpen()) return true; // Already closed

    // Check if cooldown has expired (breaker auto-resets)
    const state = breaker.getState();
    if (!state.isOpen) {
      // Cooldown expired, breaker auto-reset — allow probe
      const probes = (this.halfOpenProbes.get(agentId) ?? 0) + 1;
      this.halfOpenProbes.set(agentId, probes);
      logger.info(`Half-open probe #${probes} for agent "${agentId}"`);
      return true;
    }

    return false;
  }

  /**
   * Reset a specific agent's circuit breaker (admin override).
   */
  resetAgent(agentId: string): void {
    const breaker = this.breakers.get(agentId);
    if (breaker) {
      breaker.reset();
      this.halfOpenProbes.delete(agentId);
      this.transitionTimes.set(agentId, Date.now());
      logger.info(`Agent "${agentId}" circuit manually reset by admin`);
    }
  }

  /**
   * Set an admin override for an agent (bypass circuit breaker).
   */
  setAdminOverride(agentId: string, enabled: boolean): void {
    if (enabled) {
      this.adminOverrides.add(agentId);
      logger.info(`Admin override enabled for agent "${agentId}"`);
    } else {
      this.adminOverrides.delete(agentId);
      logger.info(`Admin override disabled for agent "${agentId}"`);
    }
  }

  /**
   * Get the circuit state for a specific agent.
   */
  getAgentState(agentId: string): AgentCircuitState {
    const breaker = this.getBreaker(agentId);
    const baseState = breaker.getState();
    return {
      ...baseState,
      agentId,
      state: this.deriveState(agentId, breaker),
      consecutiveFailures: breaker.getFailureCount(),
      lastTransitionAt: this.transitionTimes.get(agentId) ?? 0,
      halfOpenProbeCount: this.halfOpenProbes.get(agentId) ?? 0,
    };
  }

  /**
   * Get states for all tracked agents.
   */
  getAllAgentStates(): AgentCircuitState[] {
    return Array.from(this.breakers.keys()).map((id) => this.getAgentState(id));
  }

  /**
   * Get only agents with open circuits.
   */
  getOpenCircuits(): AgentCircuitState[] {
    return this.getAllAgentStates().filter((s) => s.state === 'OPEN' || s.state === 'HALF_OPEN');
  }

  /**
   * Clear all breakers (admin/testing).
   */
  clear(): void {
    this.breakers.clear();
    this.halfOpenProbes.clear();
    this.transitionTimes.clear();
    this.adminOverrides.clear();
  }
}
