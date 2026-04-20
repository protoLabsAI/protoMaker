/**
 * GOAP Feedback Loop Configuration
 *
 * Central configuration for cooldown, deduplication, registry validation,
 * and circuit breaker mechanisms that prevent GOAP incident feedback loops.
 */

export interface GoapFeedbackLoopConfig {
  /** Cooldown window in milliseconds before the same action type can fire again */
  cooldownWindowMs: number;

  /** Circuit breaker failure threshold — opens after N consecutive failures */
  circuitBreakerThreshold: number;

  /** Circuit breaker cooldown in milliseconds before auto-reset (HALF_OPEN probe) */
  circuitBreakerCooldownMs: number;

  /** Agent IDs / patterns that should never receive dispatches */
  phantomAgentPatterns: string[];

  /** Grace period in milliseconds before hard-rejecting based on registry state */
  registryGracePeriodMs: number;

  /** Per-agent-class circuit breaker overrides: agentClass -> threshold */
  agentClassThresholds: Record<string, number>;

  /**
   * Cooldown window in milliseconds after a resolved incident before the same
   * (goal, agent) pair can be re-dispatched. Prevents re-firing after resolution.
   * Default: 1 hour.
   */
  resolvedIncidentCooldownMs: number;
}

export const DEFAULT_GOAP_CONFIG: GoapFeedbackLoopConfig = {
  cooldownWindowMs: 5 * 60 * 1000, // 5 minutes
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownMs: 5 * 60 * 1000, // 5 minutes
  phantomAgentPatterns: ['auto-triage-sweep', 'system', 'user'],
  registryGracePeriodMs: 30 * 1000, // 30 seconds
  agentClassThresholds: {},
  resolvedIncidentCooldownMs: 60 * 60 * 1000, // 1 hour
};
