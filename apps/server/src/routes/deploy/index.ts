/**
 * Deploy routes - Pre-deploy drain and status endpoints
 *
 * Provides graceful agent shutdown before container restarts.
 * Called by deploy-staging.yml before rebuilding Docker images.
 */

import { Router } from 'express';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('DeployRoute');

const DRAIN_POLL_INTERVAL_MS = 5_000;
const DRAIN_TIMEOUT_MS = 120_000;

let drainInProgress = false;

export function createDeployRoutes(autoModeService: AutoModeService): Router {
  const router = Router();

  /**
   * POST /api/deploy/drain
   *
   * Gracefully drain all running agents before a deploy:
   * 1. Stop auto-mode for all projects (prevents new agents from starting)
   * 2. Wait up to 2 minutes for running agents to finish
   * 3. Force-stop any remaining agents after timeout
   */
  router.post('/drain', async (_req, res) => {
    if (drainInProgress) {
      res.status(409).json({ success: false, error: 'Drain already in progress' });
      return;
    }

    drainInProgress = true;
    const startTime = Date.now();

    try {
      // 1. Stop auto-mode for all active worktrees
      const activeWorktrees = autoModeService.getActiveAutoLoopWorktrees();
      logger.info(`[DRAIN] Stopping auto-mode for ${activeWorktrees.length} worktree(s)`);

      for (const { projectPath, branchName } of activeWorktrees) {
        try {
          await autoModeService.stopAutoLoopForProject(projectPath, branchName);
          const desc = branchName ? `${projectPath} (${branchName})` : projectPath;
          logger.info(`[DRAIN] Stopped auto-mode for ${desc}`);
        } catch (err) {
          logger.warn(`[DRAIN] Failed to stop auto-mode for ${projectPath}:`, err);
        }
      }

      // 2. Poll for running agents to finish
      let agents = await autoModeService.getRunningAgents();
      logger.info(`[DRAIN] Waiting for ${agents.length} running agent(s) to finish...`);

      while (agents.length > 0 && Date.now() - startTime < DRAIN_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL_MS));
        agents = await autoModeService.getRunningAgents();
        logger.info(
          `[DRAIN] ${agents.length} agent(s) still running (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`
        );
      }

      // 3. Force-stop remaining agents
      let forceStoppedCount = 0;
      if (agents.length > 0) {
        logger.warn(`[DRAIN] Timeout reached, force-stopping ${agents.length} agent(s)`);
        for (const agent of agents) {
          try {
            await autoModeService.stopFeature(agent.featureId);
            forceStoppedCount++;
            logger.info(`[DRAIN] Force-stopped agent for feature ${agent.featureId}`);
          } catch (err) {
            logger.warn(`[DRAIN] Failed to force-stop feature ${agent.featureId}:`, err);
          }
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.info(
        `[DRAIN] Drain complete in ${elapsed}s — ${activeWorktrees.length} worktree(s) stopped, ${forceStoppedCount} agent(s) force-stopped`
      );

      res.json({
        success: true,
        drained: true,
        worktreesStopped: activeWorktrees.length,
        agentsForceStopped: forceStoppedCount,
        elapsedSeconds: elapsed,
      });
    } catch (err) {
      logger.error('[DRAIN] Drain failed:', err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      drainInProgress = false;
    }
  });

  /**
   * GET /api/deploy/status
   *
   * Check if a drain is currently in progress.
   */
  router.get('/status', async (_req, res) => {
    const agents = await autoModeService.getRunningAgents();
    const activeWorktrees = autoModeService.getActiveAutoLoopWorktrees();

    res.json({
      drainInProgress,
      runningAgents: agents.length,
      activeWorktrees: activeWorktrees.length,
    });
  });

  return router;
}
