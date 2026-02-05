/**
 * POST /graphite-restack endpoint - Restack entire branch stack on trunk
 *
 * Uses Graphite's restack command to rebase all branches in the stack when trunk changes.
 * This is more aggressive than sync - it updates all branches in the stack to be based on
 * the latest trunk, preventing merge conflicts during PR creation.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { graphiteService } from '../../../services/graphite-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GraphiteRestack');

export function createGraphiteRestackHandler() {
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

      // Run restack
      logger.info(`Restacking Graphite stack at ${worktreePath}`);
      const result = await graphiteService.restack(worktreePath);

      if (result.conflicts) {
        res.status(409).json({
          success: false,
          error: 'Restack encountered merge conflicts that need to be resolved manually',
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
          error: result.error || 'Graphite restack failed',
          result: {
            rebased: false,
            conflicts: false,
          },
        });
        return;
      }

      logger.info(`Graphite restack successful at ${worktreePath}`);
      res.json({
        success: true,
        result: {
          rebased: result.rebased,
          conflicts: false,
          message: 'Stack restacked successfully on trunk',
        },
      });
    } catch (error) {
      logError(error, 'Graphite restack failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
