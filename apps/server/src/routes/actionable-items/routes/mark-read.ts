/**
 * POST /api/actionable-items/mark-read - Mark item(s) as read
 *
 * Request body: { projectPath: string, itemId?: string }
 * - If itemId provided: marks single item as read
 * - If omitted: marks all pending items as read
 *
 * Response: { success: true, item?: ActionableItem, count?: number }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createMarkReadHandler(service: ActionableItemService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, itemId } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (itemId) {
        const item = await service.markAsRead(projectPath, itemId);
        if (!item) {
          res.status(404).json({ success: false, error: 'Item not found' });
          return;
        }
        res.json({ success: true, item });
        return;
      }

      const count = await service.markAllAsRead(projectPath);
      res.json({ success: true, count });
    } catch (error) {
      logError(error, 'Mark read failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
