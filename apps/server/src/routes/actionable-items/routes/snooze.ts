/**
 * POST /api/actionable-items/snooze - Snooze an actionable item
 *
 * Request body: { projectPath: string, itemId: string, snoozedUntil: string }
 * Response: { success: true, item: ActionableItem }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createSnoozeHandler(service: ActionableItemService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, itemId, snoozedUntil } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!itemId || !snoozedUntil) {
        res.status(400).json({ success: false, error: 'itemId and snoozedUntil are required' });
        return;
      }

      const item = await service.snoozeItem(projectPath, itemId, snoozedUntil);
      if (!item) {
        res.status(404).json({ success: false, error: 'Item not found' });
        return;
      }

      res.json({ success: true, item });
    } catch (error) {
      logError(error, 'Snooze actionable item failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
