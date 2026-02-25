/**
 * POST /api/worktree/continue-operation endpoint
 * Continues an in-progress rebase, merge, or cherry-pick after conflict resolution
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { rebaseOpsService } from '../../../services/rebase-ops-service.js';

export function createContinueOperationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as { worktreePath: string };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      const continuedOperation = await rebaseOpsService.continue(worktreePath);
      res.json({ success: true, continuedOperation });
    } catch (error) {
      logError(error, 'Continue operation failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
