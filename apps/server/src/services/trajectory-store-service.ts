/**
 * Trajectory Store Service
 *
 * Persists verified agent execution trajectories to
 * .automaker/trajectory/{featureId}/attempt-{N}.json and feeds successful
 * trajectories into a Langfuse evaluation dataset.
 *
 * All public methods are fire-and-forget (non-blocking) or return data
 * on read. saveTrajectory() never throws or blocks the caller.
 */

import path from 'node:path';
import { createLogger, atomicWriteJson } from '@protolabs-ai/utils';
import type { VerifiedTrajectory } from '@protolabs-ai/types';
import { getLangfuseInstance } from '../lib/langfuse-singleton.js';

const logger = createLogger('TrajectoryStoreService');

const TRAJECTORY_DATASET = 'agent-trajectories';

/**
 * Service for persisting and retrieving agent execution trajectories.
 */
export class TrajectoryStoreService {
  /**
   * Save a trajectory to disk in a fire-and-forget manner.
   * Never throws — all errors are caught and logged.
   */
  saveTrajectory(projectPath: string, featureId: string, trajectory: VerifiedTrajectory): void {
    void this._saveTrajectory(projectPath, featureId, trajectory).catch((err) => {
      logger.error('[TrajectoryStore] Unexpected error in saveTrajectory:', err);
    });
  }

  /**
   * Load all trajectory attempts for a feature.
   * Returns an empty array if none exist or on error.
   */
  async loadTrajectories(projectPath: string, featureId: string): Promise<VerifiedTrajectory[]> {
    const trajectoryDir = path.join(projectPath, '.automaker', 'trajectory', featureId);

    try {
      const fs = await import('node:fs/promises');
      const entries = await fs.readdir(trajectoryDir).catch(() => [] as string[]);

      const attemptFiles = entries
        .filter((f) => f.startsWith('attempt-') && f.endsWith('.json'))
        .sort();

      const trajectories: VerifiedTrajectory[] = [];
      for (const file of attemptFiles) {
        try {
          const filePath = path.join(trajectoryDir, file);
          const raw = await fs.readFile(filePath, 'utf-8');
          trajectories.push(JSON.parse(raw) as VerifiedTrajectory);
        } catch (err) {
          logger.warn(`[TrajectoryStore] Failed to read trajectory file ${file}:`, err);
        }
      }

      return trajectories;
    } catch (err) {
      logger.warn('[TrajectoryStore] Failed to load trajectories:', err);
      return [];
    }
  }

  /**
   * Feed a trajectory to the Langfuse agent-trajectories dataset.
   * No-op if Langfuse is not configured. Never throws.
   */
  async feedToLangfuse(
    trajectory: VerifiedTrajectory,
    datasetName: string = TRAJECTORY_DATASET
  ): Promise<void> {
    const langfuse = getLangfuseInstance();
    if (!langfuse.isAvailable()) {
      logger.debug('[TrajectoryStore] Langfuse unavailable, skipping dataset feed');
      return;
    }

    try {
      await langfuse.createDatasetItem({
        datasetName,
        input: {
          featureId: trajectory.featureId,
          complexity: trajectory.complexity,
          domain: trajectory.domain,
          planSummary: trajectory.planSummary,
        },
        expectedOutput: {
          success: trajectory.verified,
          retryCount: trajectory.retryCount,
          executionSummary: trajectory.executionSummary,
        },
        metadata: {
          featureId: trajectory.featureId,
          model: trajectory.model,
          costUsd: trajectory.costUsd,
          durationMs: trajectory.durationMs,
          escalationReason: trajectory.escalationReason,
          attemptNumber: trajectory.attemptNumber,
          timestamp: trajectory.timestamp,
        },
      });

      logger.info(
        `[TrajectoryStore] Fed trajectory to Langfuse dataset "${datasetName}" (feature: ${trajectory.featureId}, attempt: ${trajectory.attemptNumber})`
      );
    } catch (err) {
      logger.error('[TrajectoryStore] Failed to feed trajectory to Langfuse:', err);
    }
  }

  /**
   * Internal implementation — writes trajectory JSON and optionally feeds to Langfuse.
   */
  private async _saveTrajectory(
    projectPath: string,
    featureId: string,
    trajectory: VerifiedTrajectory
  ): Promise<void> {
    const trajectoryDir = path.join(projectPath, '.automaker', 'trajectory', featureId);
    const filePath = path.join(trajectoryDir, `attempt-${trajectory.attemptNumber}.json`);

    try {
      await atomicWriteJson(filePath, trajectory, { createDirs: true });
      logger.info(
        `[TrajectoryStore] Saved trajectory for feature ${featureId} (attempt ${trajectory.attemptNumber})`
      );
    } catch (err) {
      logger.error('[TrajectoryStore] Failed to write trajectory file:', err);
      return;
    }

    // Feed successful trajectories to Langfuse dataset (fire-and-forget within _saveTrajectory)
    if (trajectory.verified) {
      void this.feedToLangfuse(trajectory).catch((err) => {
        logger.error('[TrajectoryStore] Unexpected error in feedToLangfuse:', err);
      });
    }
  }
}
