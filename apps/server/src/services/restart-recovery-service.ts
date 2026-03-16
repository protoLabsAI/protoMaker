/**
 * Restart Recovery Service
 *
 * Detects and handles interrupted workflows after a server restart.
 * On startup, scans the checkpoint store for features with active checkpoints
 * and validates that their worktrees are still intact. Marks interrupted features
 * in the board and optionally auto-resumes them if auto-mode was active.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from './feature-loader.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { SettingsService } from './settings-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('RestartRecoveryService');

/** Statuses that indicate a feature was mid-flight when the server stopped. */
const INTERRUPTIBLE_STATUSES = new Set([
  'in_progress',
  'running',
  'interrupted',
  'review',
  'merge',
]);

export interface InterruptedWorkflow {
  featureId: string;
  projectPath: string;
  checkpointState: string;
  featureTitle: string;
  worktreeValid: boolean;
  autoModeWasActive: boolean;
}

export class RestartRecoveryService {
  constructor(
    private featureLoader: FeatureLoader,
    private checkpointService: PipelineCheckpointService,
    private autoModeService: AutoModeService,
    private settingsService: SettingsService,
    private events: EventEmitter
  ) {}

  /**
   * Full startup recovery sequence.
   * 1. Detect interrupted workflows via checkpoint store.
   * 2. Mark interrupted features in the board.
   * 3. Auto-resume eligible features if auto-mode was active.
   */
  async runStartupRecovery(): Promise<void> {
    logger.info('[RestartRecovery] Starting startup recovery scan');
    try {
      const interrupted = await this.detectInterruptedWorkflows();

      if (interrupted.length === 0) {
        logger.info('[RestartRecovery] No interrupted workflows detected');
        return;
      }

      logger.info(`[RestartRecovery] Found ${interrupted.length} interrupted workflow(s)`);

      await this.markInterruptedFeatures(interrupted);
      await this.autoResumeIfEligible(interrupted);
    } catch (err) {
      logger.error('[RestartRecovery] Startup recovery failed:', err);
    }
  }

  /**
   * Scan all project checkpoints and return workflows that were interrupted.
   * A workflow is considered interrupted if:
   *  - A checkpoint exists for the feature, AND
   *  - The feature has an interruptible status (was mid-flight), AND
   *  - No agent is currently running for it (fresh restart, not a live agent)
   */
  async detectInterruptedWorkflows(): Promise<InterruptedWorkflow[]> {
    const settings = await this.settingsService.getGlobalSettings();
    const projectPaths = [
      ...(settings.projects?.map((p: { path: string }) => p.path) ?? []),
      ...(settings.autoModeAlwaysOn?.projects?.map((p: { projectPath: string }) => p.projectPath) ??
        []),
    ];
    const uniquePaths = [...new Set(projectPaths)];

    const autoModeProjects = new Set<string>(
      (settings.autoModeAlwaysOn?.projects ?? []).map((p: { projectPath: string }) => p.projectPath)
    );

    const interrupted: InterruptedWorkflow[] = [];

    for (const projectPath of uniquePaths) {
      try {
        const checkpoints = await this.checkpointService.listAll(projectPath);
        if (checkpoints.length === 0) continue;

        for (const checkpoint of checkpoints) {
          const { featureId, currentState } = checkpoint;

          // Skip if an agent is already running for this feature
          if (this.autoModeService.isFeatureRunning(featureId)) {
            logger.debug(`[RestartRecovery] Feature ${featureId} is already running — skipping`);
            continue;
          }

          // Load the feature to check its current status and worktree
          let feature: Feature | null = null;
          try {
            feature = await this.featureLoader.get(projectPath, featureId);
          } catch {
            logger.warn(`[RestartRecovery] Could not load feature ${featureId} — skipping`);
            continue;
          }

          if (!feature) {
            logger.debug(
              `[RestartRecovery] Feature ${featureId} not found in project ${projectPath} — skipping`
            );
            continue;
          }

          if (!this._isInterruptibleStatus(feature.status ?? '')) {
            logger.debug(
              `[RestartRecovery] Feature ${featureId} has status "${feature.status}" — not interruptible`
            );
            continue;
          }

          const worktreeValid = this._validateWorktree(projectPath, feature.id);
          const autoModeWasActive = autoModeProjects.has(projectPath);

          interrupted.push({
            featureId,
            projectPath,
            checkpointState: String(currentState),
            featureTitle: feature.title ?? featureId,
            worktreeValid,
            autoModeWasActive,
          });
        }
      } catch (err) {
        logger.warn(`[RestartRecovery] Failed to scan checkpoints for ${projectPath}:`, err);
      }
    }

    return interrupted;
  }

  /**
   * Manually resume a specific workflow.
   * Called via the MCP tool / REST endpoint for board-initiated resumes.
   */
  async resumeWorkflow(
    projectPath: string,
    featureId: string
  ): Promise<{ success: boolean; reason?: string }> {
    // Validate feature exists
    let feature: Feature | null = null;
    try {
      feature = await this.featureLoader.get(projectPath, featureId);
    } catch {
      return { success: false, reason: 'Failed to load feature' };
    }

    if (!feature) {
      return { success: false, reason: `Feature ${featureId} not found` };
    }

    if (this.autoModeService.isFeatureRunning(featureId)) {
      return { success: false, reason: 'Feature is already running' };
    }

    if (!this._validateWorktree(projectPath, featureId)) {
      return { success: false, reason: 'Worktree is missing or invalid — cannot resume' };
    }

    // Reset to backlog so auto-mode can pick it up
    try {
      await this.featureLoader.update(projectPath, featureId, {
        status: 'backlog',
        statusChangeReason: 'Manually resumed via restart recovery',
      });

      this.events.emit('feature:updated', { featureId, projectPath, status: 'backlog' });
      logger.info(`[RestartRecovery] Feature ${featureId} reset to backlog for manual resume`);

      return { success: true };
    } catch (err) {
      logger.error(`[RestartRecovery] Failed to resume feature ${featureId}:`, err);
      return { success: false, reason: 'Failed to update feature status' };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Mark interrupted features in the board so the UI can surface them.
   * Features already in 'interrupted' status are left as-is.
   */
  private async markInterruptedFeatures(interrupted: InterruptedWorkflow[]): Promise<void> {
    for (const wf of interrupted) {
      try {
        const feature = await this.featureLoader.get(wf.projectPath, wf.featureId);
        if (!feature) continue;

        // Only mark if not already interrupted
        if (feature.status === 'interrupted') {
          logger.debug(
            `[RestartRecovery] Feature ${wf.featureId} already marked interrupted — skipping`
          );
          continue;
        }

        const previousStatus = feature.status ?? 'unknown';
        await this.featureLoader.update(wf.projectPath, wf.featureId, {
          status: 'interrupted',
          statusChangeReason: `Interrupted at state "${wf.checkpointState}" (was: ${previousStatus}) — server restarted`,
        });

        this.events.emit('feature:updated', {
          featureId: wf.featureId,
          projectPath: wf.projectPath,
          status: 'interrupted',
        });

        logger.info(
          `[RestartRecovery] Marked feature ${wf.featureId} as interrupted (was: ${previousStatus}, checkpoint: ${wf.checkpointState})`
        );
      } catch (err) {
        logger.warn(
          `[RestartRecovery] Failed to mark feature ${wf.featureId} as interrupted:`,
          err
        );
      }
    }
  }

  /**
   * Auto-resume features that have valid worktrees and were in an auto-mode project.
   * Sets status back to 'backlog' so the auto-mode service can pick them up normally.
   */
  private async autoResumeIfEligible(interrupted: InterruptedWorkflow[]): Promise<void> {
    const eligible = interrupted.filter((wf) => wf.worktreeValid && wf.autoModeWasActive);

    if (eligible.length === 0) {
      logger.info('[RestartRecovery] No workflows eligible for auto-resume');
      return;
    }

    logger.info(`[RestartRecovery] Auto-resuming ${eligible.length} eligible workflow(s)`);

    for (const wf of eligible) {
      try {
        await this.featureLoader.update(wf.projectPath, wf.featureId, {
          status: 'backlog',
          statusChangeReason: `Auto-resumed from checkpoint state "${wf.checkpointState}"`,
        });

        this.events.emit('feature:updated', {
          featureId: wf.featureId,
          projectPath: wf.projectPath,
          status: 'backlog',
        });

        logger.info(
          `[RestartRecovery] Auto-resumed feature ${wf.featureId} ("${wf.featureTitle}") — reset to backlog`
        );
      } catch (err) {
        logger.warn(`[RestartRecovery] Failed to auto-resume feature ${wf.featureId}:`, err);
      }
    }
  }

  private _isInterruptibleStatus(status: string): boolean {
    return INTERRUPTIBLE_STATUSES.has(status);
  }

  private _validateWorktree(projectPath: string, featureId: string): boolean {
    // Worktree path is not stored on the Feature; it's derived the same way
    // auto-mode-service derives it when creating worktrees.
    const sanitizedId = featureId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const worktreePath = path.join(projectPath, '.worktrees', sanitizedId);
    return existsSync(worktreePath);
  }
}
