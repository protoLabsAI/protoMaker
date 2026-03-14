/**
 * Trajectory Store Types
 *
 * Structured records of agent execution attempts for the learning flywheel.
 * Trajectories are persisted on every ExecuteProcessor exit (success or failure).
 */

/**
 * Category of a trajectory fact
 */
export type TrajectoryFactCategory =
  | 'pattern'
  | 'gotcha'
  | 'constraint'
  | 'performance'
  | 'decision';

/**
 * Structured fact extracted from agent output after a successful execution.
 *
 * Stored at: .automaker/trajectory/{featureId}/facts.json
 */
export interface TrajectoryFact {
  /** Unique identifier (UUID) */
  id: string;

  /** The fact content extracted from agent output */
  content: string;

  /** Category classifying the type of knowledge */
  category: TrajectoryFactCategory;

  /** Confidence score (0-1); facts below 0.7 are filtered out before storage */
  confidence: number;

  /** Feature ID this fact belongs to */
  featureId: string;

  /** ISO timestamp when this fact was created */
  createdAt: string;
}

/**
 * Feature domain categories for trajectory matching
 */
export type TrajectoryDomain =
  | 'frontend'
  | 'backend'
  | 'devops'
  | 'fullstack'
  | 'infrastructure'
  | 'testing'
  | 'documentation'
  | 'other';

/**
 * Context window utilization snapshot captured at the end of an execution attempt.
 * Stored in VerifiedTrajectory for analysis of agent context usage patterns.
 */
export interface TrajectoryContextMetrics {
  /** Total input tokens consumed across all turns */
  inputTokens: number;
  /** Total output tokens produced across all turns */
  outputTokens: number;
  /** Estimated cost in USD for this execution */
  estimatedCostUsd: number;
  /** Fraction of the model's context window consumed (0.0–1.0) */
  contextUsagePercent: number;
}

/**
 * Verified trajectory record stored after each execution attempt.
 *
 * Stored at: .automaker/trajectory/{featureId}/attempt-{N}.json
 */
export interface VerifiedTrajectory {
  /** Feature ID this trajectory belongs to */
  featureId: string;

  /** Domain classification (frontend/backend/devops etc) */
  domain: TrajectoryDomain;

  /** Feature complexity tier */
  complexity: 'small' | 'medium' | 'large' | 'architectural';

  /** Model used for this execution */
  model: string;

  /** First 500 chars of the implementation plan */
  planSummary: string;

  /** Agent output summary (first 500 chars) */
  executionSummary: string;

  /** Cost in USD */
  costUsd: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Number of retries attempted */
  retryCount: number;

  /** Escalation reason if any */
  escalationReason?: string;

  /** True only after PR merged successfully */
  verified: boolean;

  /** ISO timestamp of when this trajectory was recorded */
  timestamp: string;

  /** Attempt number (1-indexed) */
  attemptNumber: number;
  /** Context window utilization captured at end of execution (optional for backward compatibility) */
  contextMetrics?: TrajectoryContextMetrics;
}
