/**
 * POST /api/actionable-items/dismiss - Dismiss actionable item(s)
 *
 * Request body: { projectPath: string, itemId?: string }
 * - If itemId provided: dismisses single item
 * - If omitted: dismisses all pending/snoozed items
 *
 * Response: { success: true, dismissed?: boolean, count?: number }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDismissHandler(service: ActionableItemService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, itemId } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (itemId) {
        const dismissed = await service.dismissItem(projectPath, itemId);
        if (!dismissed) {
          res.status(404).json({ success: false, error: 'Item not found' });
          return;
        }
        res.json({ success: true, dismissed });
        return;
      }

      const count = await service.dismissAll(projectPath);
      res.json({ success: true, count });
    } catch (error) {
      logError(error, 'Dismiss actionable item failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
