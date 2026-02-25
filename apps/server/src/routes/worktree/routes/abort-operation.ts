/**
 * POST /api/worktree/abort-operation endpoint
 * Aborts an in-progress rebase, merge, or cherry-pick operation
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { rebaseOpsService } from '../../../services/rebase-ops-service.js';

export function createAbortOperationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as { worktreePath: string };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      const abortedOperation = await rebaseOpsService.abort(worktreePath);
      res.json({ success: true, abortedOperation });
    } catch (error) {
      logError(error, 'Abort operation failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
