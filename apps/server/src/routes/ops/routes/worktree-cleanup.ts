/**
 * Worktree Cleanup API routes
 *
 * Manual trigger for the done-worktree-cleanup maintenance sweep.
 *
 * POST /           - Run a one-shot cleanup sweep across all active projects.
 *                    Body: { dryRun?: boolean }
 *                    Returns: { removed, paths, dryRun, projectCount, summary, durationMs }
 */

import { Router } from 'express';
import { createLogger } from '@protolabsai/utils';
import { DoneWorktreeCleanupCheck } from '../../../services/maintenance/checks/done-worktree-cleanup-check.js';
import type { WorktreeLifecycleService } from '../../../services/worktree-lifecycle-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { AutoModeService } from '../../../services/auto-mode-service.js';

const logger = createLogger('Routes:WorktreeCleanup');

export function createWorktreeCleanupRoutes(
  worktreeLifecycleService: WorktreeLifecycleService,
  featureLoader: FeatureLoader,
  events: EventEmitter,
  autoModeService: AutoModeService
): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const dryRun = req.body?.dryRun === true;

    logger.info(`Manual worktree cleanup triggered (dryRun=${dryRun})`);

    try {
      const projectPaths = Array.from(new Set(autoModeService.getActiveAutoLoopProjects()));

      const check = new DoneWorktreeCleanupCheck(
        worktreeLifecycleService,
        featureLoader,
        events,
        dryRun
      );

      const result = await check.run({ projectPaths });

      res.json({
        removed: (result.details?.totalRemoved as number) ?? 0,
        paths: (result.details?.removedPaths as string[]) ?? [],
        dryRun: (result.details?.dryRun as boolean) ?? dryRun,
        projectCount: projectPaths.length,
        summary: result.summary,
        durationMs: result.durationMs,
      });
    } catch (err) {
      logger.error('Manual worktree cleanup failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
