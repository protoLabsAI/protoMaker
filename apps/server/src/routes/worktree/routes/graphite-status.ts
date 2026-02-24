/**
 * POST /graphite-status endpoint - Get Graphite CLI availability and stack info
 *
 * Returns:
 * - Whether Graphite CLI is available on the system
 * - Whether the repo is initialized for Graphite
 * - Stack information for the current branch
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { graphiteService } from '../../../services/graphite-service.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('GraphiteStatus');

export function createGraphiteStatusHandler() {
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
        res.json({
          success: true,
          result: {
            available: false,
            initialized: false,
            stack: [],
            message: 'Graphite CLI (gt) is not installed or not in PATH',
          },
        });
        return;
      }

      // Check if repo is initialized for Graphite
      const initialized = await graphiteService.isRepoInitialized(worktreePath);

      // Get stack info if initialized
      const stack = initialized ? await graphiteService.getStackInfo(worktreePath) : [];

      logger.debug(
        `Graphite status for ${worktreePath}: available=${available}, initialized=${initialized}, stack=${stack.length} entries`
      );

      res.json({
        success: true,
        result: {
          available,
          initialized,
          stack,
          message: initialized
            ? `Graphite ready with ${stack.length} branches in stack`
            : 'Graphite available but repo not initialized (run gt repo init)',
        },
      });
    } catch (error) {
      logError(error, 'Graphite status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
