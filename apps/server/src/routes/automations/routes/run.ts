/**
 * POST /api/automations/:id/run - Manually trigger an automation
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createRunHandler(automationService: AutomationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;

      // Verify automation exists before attempting execution
      const automation = await automationService.get(id);
      if (!automation) {
        res.status(404).json({ error: `Automation not found: ${id}` });
        return;
      }

      const run = await automationService.executeAutomation(id, 'manual');
      res.json(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  };
}
