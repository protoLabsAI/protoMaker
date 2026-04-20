/**
 * GOAP Feedback Loop Protection
 *
 * Prevents incident feedback loops in the GOAP engine through four mechanisms:
 * 1. Dispatch cooldown — 5-min window prevents tick-rate storms
 * 2. Incident deduplication — agent+skill composite key prevents duplicate INC filing
 * 3. Pre-dispatch registry validation — blocks phantom agent routing
 * 4. Per-agent circuit breaker — auto-pauses routing after N consecutive failures
 */

export {
  DispatchCooldown,
  type CooldownEntry,
  type CooldownCheckResult,
} from './dispatch-cooldown.js';
export {
  IncidentDedup,
  type TrackedIncident,
  type IncidentStatus,
  type DedupCheckResult,
} from './incident-dedup.js';
export {
  DispatchValidator,
  InvalidAgentError,
  type ValidationResult,
  type AgentRegistryEntry,
} from './dispatch-validator.js';
export {
  AgentCircuitBreakerManager,
  type AgentCircuitState,
  type AgentFailureResult,
  type CircuitState,
} from './agent-circuit-breaker.js';
export { DEFAULT_GOAP_CONFIG, type GoapFeedbackLoopConfig } from './goap-config.js';
