/**
 * POST /graphite-sync endpoint - Sync branch with its stack parent
 *
 * Uses Graphite's sync command to rebase the current branch on its parent.
 * This is useful for keeping feature branches up to date with epic branches.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { graphiteService } from '../../../services/graphite-service.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('GraphiteSync');

export function createGraphiteSyncHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Check if Graphite CLI is available
      const available = await graphiteService.isAvailable();
      if (!available) {
        res.status(400).json({
          success: false,
          error: 'Graphite CLI (gt) is not installed or not in PATH',
        });
        return;
      }

      // Check if repo is initialized
      const initialized = await graphiteService.isRepoInitialized(worktreePath);
      if (!initialized) {
        res.status(400).json({
          success: false,
          error: 'Repository is not initialized for Graphite. Run: gt repo init',
        });
        return;
      }

      // Run sync
      logger.info(`Syncing Graphite stack at ${worktreePath}`);
      const result = await graphiteService.sync(worktreePath);

      if (result.conflicts) {
        res.status(409).json({
          success: false,
          error: 'Sync encountered merge conflicts that need to be resolved manually',
          result: {
            rebased: false,
            conflicts: true,
          },
        });
        return;
      }

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error || 'Graphite sync failed',
          result: {
            rebased: false,
            conflicts: false,
          },
        });
        return;
      }

      logger.info(`Graphite sync successful at ${worktreePath}`);
      res.json({
        success: true,
        result: {
          rebased: result.rebased,
          conflicts: false,
          message: 'Stack synced successfully with parent branch',
        },
      });
    } catch (error) {
      logError(error, 'Graphite sync failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
