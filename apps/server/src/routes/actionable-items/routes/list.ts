/**
 * POST /api/actionable-items/list - List actionable items for a project
 *
 * Request body: { projectPath: string, includeActed?: boolean, includeDismissed?: boolean, includeExpired?: boolean }
 * Response: { success: true, items: ActionableItem[], pendingCount: number, unreadCount: number }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createListHandler(service: ActionableItemService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, includeActed, includeDismissed, includeExpired } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const items = await service.getActionableItems(projectPath, {
        includeActed,
        includeDismissed,
        includeExpired,
      });
      const pendingCount = await service.getPendingCount(projectPath);
      const unreadCount = await service.getUnreadCount(projectPath);

      res.json({ success: true, items, pendingCount, unreadCount });
    } catch (error) {
      logError(error, 'List actionable items failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
