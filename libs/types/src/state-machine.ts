/**
 * State Machine types — Edge-based transition table
 *
 * Replaces hardcoded nextState returns in processors with a declarative
 * transition table. Each edge has a condition and priority, enabling
 * auditable routing logic in one place.
 */

import { FeatureState } from './lead-engineer.js';

/**
 * Context available for transition edge evaluation.
 */
export interface TransitionContext {
  featureId: string;
  planRequired: boolean;
  planOutput?: string;
  prNumber?: number;
  retryCount: number;
  maxRetries: number;
  remediationAttempts: number;
  maxRemediations: number;
  mergeRetryCount: number;
  ciStatus?: 'pending' | 'passing' | 'failing';
  reviewState?: 'pending' | 'approved' | 'changes_requested';
  escalationReason?: string;
  success: boolean;
}

/**
 * A single edge in the transition table.
 * Edges are evaluated in priority order (highest first).
 */
export interface TransitionEdge {
  /** Source state */
  from: FeatureState;
  /** Target state */
  to: FeatureState;
  /** Condition for this edge to fire */
  condition: (ctx: TransitionContext) => boolean;
  /** Higher priority edges are evaluated first (default 0) */
  priority: number;
  /** Optional description for debugging/auditing */
  description?: string;
}

/**
 * Result from a processor after it finishes its work.
 * No longer includes nextState — routing is handled by the transition table.
 */
export interface ProcessResult {
  /** Whether this processor succeeded */
  success: boolean;
  /** Context updates to merge into the transition context */
  contextUpdates: Partial<TransitionContext>;
  /** Whether processing should continue (false = terminal) */
  shouldContinue: boolean;
}

/**
 * Default transition table for the feature state machine.
 */
export const DEFAULT_TRANSITION_TABLE: TransitionEdge[] = [
  // INTAKE transitions
  {
    from: FeatureState.INTAKE,
    to: FeatureState.PLAN,
    condition: (ctx) => ctx.success && ctx.planRequired,
    priority: 1,
    description: 'Complex feature requires planning',
  },
  {
    from: FeatureState.INTAKE,
    to: FeatureState.EXECUTE,
    condition: (ctx) => ctx.success && !ctx.planRequired,
    priority: 0,
    description: 'Simple feature, skip planning',
  },
  {
    from: FeatureState.INTAKE,
    to: FeatureState.ESCALATE,
    condition: (ctx) => !ctx.success,
    priority: -1,
    description: 'Intake failed (unmet deps)',
  },

  // PLAN transitions
  {
    from: FeatureState.PLAN,
    to: FeatureState.EXECUTE,
    condition: (ctx) => ctx.success && !!ctx.planOutput,
    priority: 0,
    description: 'Plan approved, proceed to execution',
  },
  {
    from: FeatureState.PLAN,
    to: FeatureState.ESCALATE,
    condition: (ctx) => !ctx.success,
    priority: -1,
    description: 'Plan rejected',
  },

  // EXECUTE transitions
  {
    from: FeatureState.EXECUTE,
    to: FeatureState.REVIEW,
    condition: (ctx) => ctx.success && !!ctx.prNumber,
    priority: 1,
    description: 'Execution completed with PR',
  },
  {
    from: FeatureState.EXECUTE,
    to: FeatureState.EXECUTE,
    condition: (ctx) => !ctx.success && ctx.retryCount < ctx.maxRetries,
    priority: 0,
    description: 'Execution failed, retry',
  },
  {
    from: FeatureState.EXECUTE,
    to: FeatureState.ESCALATE,
    condition: (ctx) => !ctx.success && ctx.retryCount >= ctx.maxRetries,
    priority: -1,
    description: 'Max retries exceeded',
  },

  // REVIEW transitions
  {
    from: FeatureState.REVIEW,
    to: FeatureState.MERGE,
    condition: (ctx) => ctx.reviewState === 'approved',
    priority: 1,
    description: 'PR approved',
  },
  {
    from: FeatureState.REVIEW,
    to: FeatureState.EXECUTE,
    condition: (ctx) =>
      ctx.reviewState === 'changes_requested' && ctx.remediationAttempts < ctx.maxRemediations,
    priority: 0,
    description: 'Changes requested, remediate',
  },
  {
    from: FeatureState.REVIEW,
    to: FeatureState.ESCALATE,
    condition: (ctx) =>
      ctx.reviewState === 'changes_requested' && ctx.remediationAttempts >= ctx.maxRemediations,
    priority: -1,
    description: 'Max remediations exceeded',
  },

  // MERGE transitions
  {
    from: FeatureState.MERGE,
    to: FeatureState.DEPLOY,
    condition: (ctx) => ctx.success,
    priority: 0,
    description: 'PR merged successfully',
  },
  {
    from: FeatureState.MERGE,
    to: FeatureState.ESCALATE,
    condition: (ctx) => !ctx.success,
    priority: -1,
    description: 'Merge failed',
  },

  // DEPLOY transitions
  {
    from: FeatureState.DEPLOY,
    to: FeatureState.DONE,
    condition: (ctx) => ctx.success,
    priority: 0,
    description: 'Deployment verified',
  },
];

/**
 * Resolve the next state from the transition table.
 * Evaluates edges from the current state, sorted by priority (highest first).
 * Returns the first matching edge's target state, or ESCALATE if none match.
 */
export function resolveTransition(
  table: TransitionEdge[],
  currentState: FeatureState,
  ctx: TransitionContext
): FeatureState {
  const edges = table
    .filter((e) => e.from === currentState)
    .sort((a, b) => b.priority - a.priority);

  for (const edge of edges) {
    if (edge.condition(ctx)) {
      return edge.to;
    }
  }

  return FeatureState.ESCALATE;
}
