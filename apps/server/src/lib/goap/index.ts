/**
 * GOAP Feedback Loop Protection
 *
 * Prevents incident feedback loops in the GOAP engine through five mechanisms:
 * 0. Goal satisfied guard — skips dispatch when the target goal predicate is
 *    already satisfied in the current world state snapshot (pre-dispatch check)
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
export {
  GoalSatisfiedGuard,
  createGoalSatisfiedGuard,
  BUILTIN_GOAL_PREDICATES,
  type GoalPredicate,
  type GoalSatisfiedResult,
  type WorldStateSnapshot,
} from './goal-satisfied-guard.js';
