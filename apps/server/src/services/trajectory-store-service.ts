/**
 * Trajectory Store Service
 *
 * Persists structured execution trajectories to `.automaker/trajectory/{featureId}/attempt-{N}.json`.
 * Each trajectory captures: attempt number, state transitions, duration, cost, model used,
 * outcome (success/failure/escalation), and failure analysis if applicable.
 *
 * Writes are non-blocking (fire-and-forget) to avoid slowing down the main execution path.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { getAutomakerDir } from '@protolabs-ai/platform';
import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';

const logger = createLogger('TrajectoryStoreService');

/**
 * Represents a state transition in the feature processing pipeline.
 */
export interface TrajectoryStateTransition {
  /** Previous state (null if initial) */
  from: string | null;
  /** New state */
  to: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional reason for transition */
  reason?: string;
}

/**
 * Failure analysis data for escalated features.
 */
export interface TrajectoryFailureAnalysis {
  /** Primary reason for escalation */
  reason: string;
  /** Number of retry attempts before escalation */
  retryCount: number;
  /** Number of remediation cycles attempted */
  remediationAttempts: number;
  /** Last error message if available */
  lastError?: string;
  /** PR feedback that may have contributed to failure */
  reviewFeedback?: string;
}

/**
 * A complete execution trajectory record.
 */
export interface ExecutionTrajectory {
  /** Feature ID this trajectory belongs to */
  featureId: string;
  /** Feature title for human readability */
  featureTitle: string;
  /** Attempt number (1-indexed) */
  attemptNumber: number;
  /** Outcome of this attempt */
  outcome: 'success' | 'escalated' | 'interrupted';
  /** ISO 8601 timestamp when execution started */
  startedAt: string;
  /** ISO 8601 timestamp when execution completed */
  completedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Total cost in USD for this attempt */
  costUsd: number;
  /** Model used for this execution */
  model: string;
  /** State transitions during this attempt */
  stateTransitions: TrajectoryStateTransition[];
  /** PR number if one was created */
  prNumber?: number;
  /** Failure analysis (only present when outcome is 'escalated') */
  failureAnalysis?: TrajectoryFailureAnalysis;
}

/**
 * Input data for saving a trajectory.
 */
export interface SaveTrajectoryInput {
  feature: Feature;
  projectPath: string;
  outcome: 'success' | 'escalated' | 'interrupted';
  stateTransitions: TrajectoryStateTransition[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  costUsd: number;
  model: string;
  prNumber?: number;
  failureAnalysis?: TrajectoryFailureAnalysis;
}

/**
 * Get the trajectory directory for a feature.
 */
function getTrajectoryDir(projectPath: string, featureId: string): string {
  return path.join(getAutomakerDir(projectPath), 'trajectory', featureId);
}

/**
 * Get the next available attempt number by checking existing files.
 */
async function getNextAttemptNumber(trajectoryDir: string): Promise<number> {
  try {
    const files = await fs.readdir(trajectoryDir);
    const attemptNumbers = files
      .filter((f) => f.startsWith('attempt-') && f.endsWith('.json'))
      .map((f) => {
        const match = f.match(/^attempt-(\d+)\.json$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    if (attemptNumbers.length === 0) {
      return 1;
    }
    return Math.max(...attemptNumbers) + 1;
  } catch {
    // Directory doesn't exist yet
    return 1;
  }
}

/**
 * Service for persisting execution trajectories.
 */
export class TrajectoryStoreService {
  /**
   * Save an execution trajectory to disk.
   *
   * This method is fire-and-forget - it does not block the caller.
   * Errors are logged but not thrown.
   *
   * @param input - The trajectory data to save
   */
  save(input: SaveTrajectoryInput): void {
    // Fire-and-forget: immediately return, process asynchronously
    void this.saveAsync(input);
  }

  /**
   * Internal async implementation for saving trajectories.
   */
  private async saveAsync(input: SaveTrajectoryInput): Promise<void> {
    try {
      const {
        feature,
        projectPath,
        outcome,
        stateTransitions,
        startedAt,
        completedAt,
        durationMs,
        costUsd,
        model,
        prNumber,
        failureAnalysis,
      } = input;

      const trajectoryDir = getTrajectoryDir(projectPath, feature.id);

      // Ensure directory exists
      await fs.mkdir(trajectoryDir, { recursive: true });

      // Get next attempt number
      const attemptNumber = await getNextAttemptNumber(trajectoryDir);

      // Build trajectory record
      const trajectory: ExecutionTrajectory = {
        featureId: feature.id,
        featureTitle: feature.title || 'Untitled',
        attemptNumber,
        outcome,
        startedAt,
        completedAt,
        durationMs,
        costUsd,
        model,
        stateTransitions,
      };

      if (prNumber !== undefined) {
        trajectory.prNumber = prNumber;
      }

      if (failureAnalysis) {
        trajectory.failureAnalysis = failureAnalysis;
      }

      // Write trajectory file
      const filePath = path.join(trajectoryDir, `attempt-${attemptNumber}.json`);
      await fs.writeFile(filePath, JSON.stringify(trajectory, null, 2), 'utf-8');

      logger.info(`[TrajectoryStore] Saved trajectory for feature ${feature.id}`, {
        attemptNumber,
        outcome,
        durationMs,
        costUsd,
        filePath,
      });
    } catch (err) {
      // Log error but don't throw - fire-and-forget semantics
      logger.warn(`[TrajectoryStore] Failed to save trajectory:`, err);
    }
  }

  /**
   * Read all trajectories for a feature.
   *
   * @param projectPath - Project path
   * @param featureId - Feature ID
   * @returns Array of trajectories, sorted by attempt number
   */
  async getTrajectories(projectPath: string, featureId: string): Promise<ExecutionTrajectory[]> {
    try {
      const trajectoryDir = getTrajectoryDir(projectPath, featureId);
      const files = await fs.readdir(trajectoryDir);

      const trajectories: ExecutionTrajectory[] = [];

      for (const file of files) {
        if (file.startsWith('attempt-') && file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(trajectoryDir, file), 'utf-8');
            trajectories.push(JSON.parse(content) as ExecutionTrajectory);
          } catch {
            // Skip invalid files
          }
        }
      }

      // Sort by attempt number
      return trajectories.sort((a, b) => a.attemptNumber - b.attemptNumber);
    } catch {
      // Directory doesn't exist or other error
      return [];
    }
  }
}
