/**
 * Pipeline Checkpoint Service
 *
 * Persists and recovers feature state machine checkpoints for crash recovery.
 * Checkpoints are saved after each successful state transition, enabling
 * features to resume from their last known-good state after a server restart.
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import type { PipelineCheckpoint, GoalGateResult } from '@protolabsai/types';
import { FeatureState } from '@protolabsai/types';
import type { StateContext, FeatureProcessingState } from './lead-engineer-service.js';

const execAsync = promisify(exec);
const logger = createLogger('PipelineCheckpointService');

const CHECKPOINTS_DIR = 'checkpoints';

export class PipelineCheckpointService {
  /**
   * Save a checkpoint after a successful state transition.
   */
  async save(
    projectPath: string,
    featureId: string,
    currentState: FeatureProcessingState,
    ctx: StateContext,
    completedStates: string[],
    goalGateResults: GoalGateResult[]
  ): Promise<void> {
    const checkpoint: PipelineCheckpoint = {
      featureId,
      projectPath,
      currentState: currentState as unknown as FeatureState,
      stateContext: this.serializeContext(ctx),
      completedStates,
      goalGateResults,
      timestamp: new Date().toISOString(),
      version: 1,
    };

    const filePath = this.getCheckpointPath(projectPath, featureId);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await atomicWriteJson(filePath, checkpoint);
      logger.debug(`Checkpoint saved for ${featureId} at state ${currentState}`);
    } catch (err) {
      logger.error(`Failed to save checkpoint for ${featureId}:`, err);
    }
  }

  /**
   * Load a checkpoint for a feature, if one exists.
   */
  async load(projectPath: string, featureId: string): Promise<PipelineCheckpoint | null> {
    const filePath = this.getCheckpointPath(projectPath, featureId);
    try {
      const result = await readJsonWithRecovery<PipelineCheckpoint | null>(filePath, null);
      if (result.data && result.data.version === 1) {
        const checkpoint = result.data;
        // Validate the PR on every load so stale checkpoints never surface
        // regardless of which code path calls load().
        const state = checkpoint.currentState as string;
        const prNumber = checkpoint.stateContext.prNumber as number | undefined;
        if ((state === 'REVIEW' || state === 'MERGE') && prNumber) {
          const prStatus = await this.validatePRForResume(projectPath, prNumber);
          // Only invalidate on DEFINITIVE closed/not_found responses. 'unknown'
          // (transient gh CLI error) leaves the checkpoint untouched so a brief
          // GitHub outage can't wipe valid checkpoints across the portfolio.
          if (prStatus === 'closed' || prStatus === 'not_found') {
            logger.warn(
              `Checkpoint for ${featureId} at ${state} references PR #${prNumber} which is ${prStatus} — auto-invalidating checkpoint`
            );
            await this.delete(projectPath, featureId);
            return null;
          }
        }
        logger.info(`Checkpoint loaded for ${featureId} at state ${checkpoint.currentState}`);
        return checkpoint;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a checkpoint after feature processing completes (success or terminal escalation).
   */
  async delete(projectPath: string, featureId: string): Promise<void> {
    const filePath = this.getCheckpointPath(projectPath, featureId);
    try {
      await fs.unlink(filePath);
      logger.debug(`Checkpoint deleted for ${featureId}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to delete checkpoint for ${featureId}:`, err);
      }
    }
  }

  /**
   * List all checkpoints for a project (used during crash recovery).
   */
  async listAll(projectPath: string): Promise<PipelineCheckpoint[]> {
    const dir = this.getCheckpointsDir(projectPath);
    try {
      const files = await fs.readdir(dir);
      const checkpoints: PipelineCheckpoint[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(dir, file);
        try {
          const result = await readJsonWithRecovery<PipelineCheckpoint | null>(filePath, null);
          if (result.data && result.data.version === 1) {
            checkpoints.push(result.data);
          }
        } catch {
          // Skip corrupt checkpoints
        }
      }

      return checkpoints;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to list checkpoints for ${projectPath}:`, err);
      }
      return [];
    }
  }

  /**
   * Validate that a PR referenced in a REVIEW/MERGE checkpoint still exists and is resumable.
   *
   * Returns:
   *   'open'      — PR is open; safe to resume
   *   'merged'    — PR already merged; let the REVIEW processor detect and advance
   *   'closed'    — PR was closed without merging; invalidate the checkpoint
   *   'not_found' — gh CLI error or PR does not exist; invalidate the checkpoint
   */
  async validatePRForResume(
    projectPath: string,
    prNumber: number
  ): Promise<'open' | 'merged' | 'closed' | 'not_found' | 'unknown'> {
    try {
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json state,mergedAt --jq '{state: .state, mergedAt: .mergedAt}'`,
        { cwd: projectPath, timeout: 10000 }
      );
      const data = JSON.parse(stdout.trim()) as { state: string; mergedAt: string | null };
      if (data.state === 'MERGED' || data.mergedAt) return 'merged';
      if (data.state === 'CLOSED') return 'closed';
      if (data.state === 'OPEN') return 'open';
      return 'not_found';
    } catch (err) {
      // Distinguish "PR genuinely doesn't exist" (gh CLI succeeds, state unmapped)
      // from "transient error talking to GitHub" (network, rate limit, CLI failure).
      // A transient error must NOT cause load() to delete a valid checkpoint — a
      // brief outage should leave state untouched. Caller treats 'unknown' as
      // "proceed with the checkpoint as-is."
      logger.debug(
        `validatePRForResume: gh CLI error for PR #${prNumber} — returning 'unknown' (transient, keep checkpoint): ${err instanceof Error ? err.message : String(err)}`
      );
      return 'unknown';
    }
  }

  /**
   * Restore a StateContext from a checkpoint's serialized data.
   */
  restoreContext(checkpoint: PipelineCheckpoint): Partial<StateContext> {
    const ctx = checkpoint.stateContext;
    return {
      retryCount: (ctx.retryCount as number) || 0,
      planRequired: (ctx.planRequired as boolean) || false,
      planOutput: ctx.planOutput as string | undefined,
      prNumber: ctx.prNumber as number | undefined,
      ciStatus: ctx.ciStatus as StateContext['ciStatus'],
      remediationAttempts: (ctx.remediationAttempts as number) || 0,
      mergeRetryCount: (ctx.mergeRetryCount as number) || 0,
      escalationReason: ctx.escalationReason as string | undefined,
    };
  }

  private serializeContext(ctx: StateContext): Record<string, unknown> {
    return {
      retryCount: ctx.retryCount,
      planRequired: ctx.planRequired,
      planOutput: ctx.planOutput,
      prNumber: ctx.prNumber,
      ciStatus: ctx.ciStatus,
      remediationAttempts: ctx.remediationAttempts,
      mergeRetryCount: ctx.mergeRetryCount,
      escalationReason: ctx.escalationReason,
    };
  }

  private getCheckpointsDir(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), CHECKPOINTS_DIR);
  }

  private getCheckpointPath(projectPath: string, featureId: string): string {
    return path.join(this.getCheckpointsDir(projectPath), `${featureId}.json`);
  }
}
