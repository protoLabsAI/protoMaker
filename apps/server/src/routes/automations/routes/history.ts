/**
 * GET /api/automations/:id/history - Get run history for an automation
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createHistoryHandler(automationService: AutomationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      // Verify automation exists
      const automation = await automationService.get(id);
      if (!automation) {
        res.status(404).json({ error: `Automation not found: ${id}` });
        return;
      }

      const runs = await automationService.getHistory(id);
      res.json({ runs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  };
}
