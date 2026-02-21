/**
 * POST /api/actionable-items/create - Create a new actionable item
 *
 * Request body: CreateActionableItemInput fields
 * Response: { success: true, item: ActionableItem }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createCreateHandler(service: ActionableItemService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        actionType,
        priority,
        title,
        message,
        expiresAt,
        actionPayload,
        category,
      } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!actionType || !priority || !title || !message) {
        res.status(400).json({
          success: false,
          error: 'actionType, priority, title, and message are required',
        });
        return;
      }

      const item = await service.createActionableItem({
        projectPath,
        actionType,
        priority,
        title,
        message,
        expiresAt,
        actionPayload: actionPayload || {},
        category,
      });

      res.json({ success: true, item });
    } catch (error) {
      logError(error, 'Create actionable item failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
