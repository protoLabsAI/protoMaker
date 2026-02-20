/**
 * Unified Idea-to-Production Pipeline Phase Types
 *
 * Consolidates WorkItemState, FeatureState, GTM content flow, and ContentFlowService
 * into a single 9-phase model with branch-aware gate configuration.
 *
 * Phases are universal; processors differ by branch (ops vs gtm).
 * GTM branch skips DESIGN and PLAN (jumps SPEC_REVIEW → EXECUTE).
 */

/**
 * The 9 phases of the unified pipeline.
 *
 * | Phase       | What Happens                                 |
 * | ----------- | -------------------------------------------- |
 * | TRIAGE      | Classify signal, route to branch              |
 * | RESEARCH    | Investigate feasibility, gather context       |
 * | SPEC        | Generate spec/brief for review                |
 * | SPEC_REVIEW | User reviews and decides (approve/deny/edit)  |
 * | DESIGN      | Architecture/structure planning               |
 * | PLAN        | Break into executable tasks with deps         |
 * | EXECUTE     | Do the work                                   |
 * | VERIFY      | Quality checks, review, CI                    |
 * | PUBLISH     | Ship it                                       |
 */
export type PipelinePhase =
  | 'TRIAGE'
  | 'RESEARCH'
  | 'SPEC'
  | 'SPEC_REVIEW'
  | 'DESIGN'
  | 'PLAN'
  | 'EXECUTE'
  | 'VERIFY'
  | 'PUBLISH';

/** Branch determines which processors handle each phase */
export type PipelineBranch = 'ops' | 'gtm';

/**
 * Gate mode controlling phase transitions.
 *
 * - `auto`: Proceed immediately on success
 * - `manual`: Always pause for user action
 * - `review`: Auto-proceed if clean; hold if issues detected
 */
export type GateMode = 'auto' | 'manual' | 'review';

/** Result of evaluating a phase gate */
export interface PhaseGateResult {
  phase: PipelinePhase;
  passed: boolean;
  reason: string;
  issues?: string[];
  artifacts?: Record<string, unknown>;
}

/** Records a single phase transition in the pipeline */
export interface PhaseTransition {
  from: PipelinePhase | null;
  to: PipelinePhase;
  timestamp: string;
  triggeredBy: 'auto' | 'user' | 'system';
  reason?: string;
}

/** Full pipeline state tracked on a feature */
export interface PipelineState {
  currentPhase: PipelinePhase;
  branch: PipelineBranch;
  phaseHistory: PhaseTransition[];
  gateOverrides?: Partial<Record<PipelinePhase, GateMode>>;
  awaitingGate: boolean;
  /** Phase pending gate resolution (set when awaitingGate is true) */
  awaitingGatePhase?: PipelinePhase | null;
  gateArtifacts?: Record<string, unknown>;
  startedAt: string;
  /** Langfuse root trace ID for this entire pipeline run */
  traceId?: string;
  /** Per-phase Langfuse span IDs for drill-down */
  phaseSpanIds?: Partial<Record<PipelinePhase, string>>;
}

/** Per-branch gate configuration for all phases */
export interface PipelineGateConfig {
  ops: Record<PipelinePhase, GateMode>;
  gtm: Record<PipelinePhase, GateMode>;
}

/** Ordered list of all pipeline phases */
export const PIPELINE_PHASES: PipelinePhase[] = [
  'TRIAGE',
  'RESEARCH',
  'SPEC',
  'SPEC_REVIEW',
  'DESIGN',
  'PLAN',
  'EXECUTE',
  'VERIFY',
  'PUBLISH',
];

/** Phases that the GTM branch skips (jumps SPEC_REVIEW → EXECUTE) */
export const GTM_SKIP_PHASES: PipelinePhase[] = ['DESIGN', 'PLAN'];

/** Default gate configuration per branch */
export const DEFAULT_PIPELINE_GATES: PipelineGateConfig = {
  ops: {
    TRIAGE: 'auto',
    RESEARCH: 'auto',
    SPEC: 'auto',
    SPEC_REVIEW: 'review',
    DESIGN: 'auto',
    PLAN: 'auto',
    EXECUTE: 'auto',
    VERIFY: 'review',
    PUBLISH: 'auto',
  },
  gtm: {
    TRIAGE: 'auto',
    RESEARCH: 'auto',
    SPEC: 'auto',
    SPEC_REVIEW: 'manual',
    DESIGN: 'auto',
    PLAN: 'auto',
    EXECUTE: 'auto',
    VERIFY: 'review',
    PUBLISH: 'manual',
  },
};

/**
 * Maps pipeline phases to legacy WorkItemState values for backward compatibility.
 * Features with pipelineState can derive workItemState from this mapping.
 */
export const PIPELINE_TO_WORK_ITEM_STATE: Record<PipelinePhase, string> = {
  TRIAGE: 'idea',
  RESEARCH: 'research',
  SPEC: 'pm_processing',
  SPEC_REVIEW: 'prd_ready',
  DESIGN: 'approved',
  PLAN: 'planned',
  EXECUTE: 'in_progress',
  VERIFY: 'testing',
  PUBLISH: 'done',
};
