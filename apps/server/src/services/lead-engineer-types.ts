/**
 * Lead Engineer — Shared Types, Interfaces, and Constants
 *
 * All types shared across the lead-engineer subsystem files.
 */

import type { Feature, AgentRole } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { PRFeedbackService } from './pr-feedback-service.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import type { ContextFidelityService } from './context-fidelity-service.js';
import type { KnowledgeStoreService } from './knowledge-store-service.js';
import type { SettingsService } from './settings-service.js';
import type { FactStoreService } from './fact-store-service.js';
import type { LeadHandoffService } from './lead-handoff-service.js';
import type { HITLFormService } from './hitl-form-service.js';
import type { TrajectoryStoreService } from './trajectory-store-service.js';

// ────────────────────────── Budget / timing constants ──────────────────────────

export const EXECUTE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_PR_ITERATIONS = 2;
export const MAX_TOTAL_REMEDIATION_CYCLES = 4;
export const MERGE_RETRY_DELAY_MS = 60 * 1000; // 60 seconds
export const REVIEW_POLL_DELAY_MS = 30 * 1000; // 30 seconds

/**
 * Maximum time a feature can remain in the REVIEW state (waiting for CI/approval)
 * before auto-escalating to ESCALATE with an actionable error message.
 *
 * Configurable via REVIEW_PENDING_TIMEOUT_MINUTES env variable (default: 45 minutes).
 * The previous implicit timeout was ~9 minutes due to polling interaction with
 * external timing constraints; this raises it to a safe configurable value.
 */
export const REVIEW_PENDING_TIMEOUT_MS = (() => {
  const minutes = parseInt(process.env.REVIEW_PENDING_TIMEOUT_MINUTES ?? '45', 10);
  return (isNaN(minutes) || minutes <= 0 ? 45 : minutes) * 60 * 1000;
})();

// ────────────────────────── Retry limits ──────────────────────────

/**
 * Maximum number of full agent re-runs (burns compute budget).
 * Triggered when the agent produces bad code or logic errors.
 * Centralised here so it can be adjusted without touching processor logic.
 */
export const MAX_AGENT_RETRIES = 3;

/**
 * Maximum number of retries for lightweight infrastructure steps
 * (e.g. git push blocked by a lock file, gh CLI transient error).
 * These retries do NOT re-run the agent, so they are cheap.
 */
export const MAX_INFRA_RETRIES = 3;

// ────────────────────────── Service Context ──────────────────────────

/**
 * Minimal interface for plan review — avoids circular imports with AntagonisticReviewService.
 */
export interface IPlanReviewService {
  verifyPlan(params: {
    featureTitle: string;
    featureDescription: string;
    complexity: string;
    planOutput: string;
    projectPath: string;
  }): Promise<{ approved: boolean; reason?: string } | null>;
}

/**
 * Service context injected into state processors.
 * Provides access to real services without circular dependencies.
 */
export interface ProcessorServiceContext {
  events: EventEmitter;
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  prFeedbackService?: PRFeedbackService;
  checkpointService?: PipelineCheckpointService;
  contextFidelityService?: ContextFidelityService;
  knowledgeStoreService?: KnowledgeStoreService;
  settingsService?: SettingsService;
  factStoreService?: FactStoreService;
  leadHandoffService?: LeadHandoffService;
  antagonisticReviewService?: IPlanReviewService;
  hitlFormService?: HITLFormService;
  trajectoryStoreService?: TrajectoryStoreService;
}

// ────────────────────────── Feature State Machine Types ──────────────────────────

/**
 * Feature processing states for the state machine.
 * Each feature flows through these states from INTAKE to completion or ESCALATE.
 */
export type FeatureProcessingState =
  | 'INTAKE'
  | 'PLAN'
  | 'EXECUTE'
  | 'REVIEW'
  | 'MERGE'
  | 'DEPLOY'
  | 'DONE'
  | 'ESCALATE';

/**
 * State transition result
 */
export interface StateTransitionResult {
  /** Next state to transition to (null = terminal state) */
  nextState: FeatureProcessingState | null;
  /** Whether processing should continue */
  shouldContinue: boolean;
  /** Optional reason for the transition */
  reason?: string;
  /** Optional data to pass to next state */
  context?: Record<string, unknown>;
}

/**
 * State processor context - data available to all states
 */
export interface StateContext {
  feature: Feature;
  projectPath: string;
  /** Model selected during INTAKE phase. Used by ExecuteProcessor to run the agent. */
  selectedModel?: string;
  /** Number of full agent re-runs triggered by agent-level failures (bad code, logic errors). */
  retryCount: number;
  /**
   * Number of lightweight infrastructure step retries (git push lock, gh CLI error, etc.).
   * These do NOT re-run the agent, so they do not consume compute budget.
   */
  infraRetryCount: number;
  planRequired: boolean;
  assignedPersona?: AgentRole;
  planOutput?: string;
  prNumber?: number;
  ciStatus?: 'pending' | 'passing' | 'failing';
  remediationAttempts: number;
  mergeRetryCount: number;
  planRetryCount: number;
  escalationReason?: string;
  reviewFeedback?: string;
  /** Learnings from sibling features: structured facts (markdown, grouped by category) from facts.json, or raw reflection.md content as fallback */
  siblingReflections?: string[];
  /** Aggregated facts from completed milestones in this project, formatted as "Project Knowledge" markdown section */
  projectKnowledge?: string;
  /** ISO 8601 timestamp when processing started */
  startedAt?: string;
}

/**
 * State processor interface - each state implements this
 */
export interface StateProcessor {
  /** Called when entering this state */
  enter(ctx: StateContext): Promise<void>;
  /** Process the state and determine next transition */
  process(ctx: StateContext): Promise<StateTransitionResult>;
  /** Called when exiting this state */
  exit(ctx: StateContext): Promise<void>;
}

/**
 * A goal gate validator: pure function that checks preconditions
 * before or postconditions after a state transition.
 */
export interface GoalGateValidator {
  /** Unique gate identifier */
  gateId: string;
  /** Human-readable description */
  description: string;
  /** Evaluate the gate. Returns { passed, reason } */
  evaluate: (ctx: StateContext) => { passed: boolean; reason: string };
  /** State to retry from on failure (optional — defaults to ESCALATE) */
  retryTarget?: FeatureProcessingState;
}

// ────────────────────────── Session Persistence ──────────────────────────

/**
 * Persisted session data (subset of LeadEngineerSession)
 */
export interface PersistedSessionData {
  projectPath: string;
  projectSlug: string;
  maxConcurrency: number;
  startedAt: string;
}
