/**
 * POST /api/actionable-items/update-status - Update actionable item status
 *
 * Request body: { projectPath: string, itemId: string, status: ActionableItemStatus }
 * Response: { success: true, item: ActionableItem }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createUpdateStatusHandler(service: ActionableItemService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, itemId, status } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!itemId || !status) {
        res.status(400).json({ success: false, error: 'itemId and status are required' });
        return;
      }

      const item = await service.updateStatus(projectPath, itemId, status);
      if (!item) {
        res.status(404).json({ success: false, error: 'Item not found' });
        return;
      }

      res.json({ success: true, item });
    } catch (error) {
      logError(error, 'Update actionable item status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
