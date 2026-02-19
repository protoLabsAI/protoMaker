/**
 * Context Fidelity modes for agent execution.
 *
 * Controls how much prior context is passed to an agent
 * at each stage of the pipeline, balancing context relevance
 * against token budget waste.
 */

/** Fidelity mode for context passed to agents */
export type ContextFidelityMode = 'full' | 'compact' | 'summary' | 'none';

/** Per-stage default fidelity modes */
export const DEFAULT_STAGE_FIDELITY: Record<string, ContextFidelityMode> = {
  PLAN: 'none',
  EXECUTE: 'full',
  EXECUTE_RETRY: 'compact',
  REVIEW_REMEDIATION: 'compact',
};
