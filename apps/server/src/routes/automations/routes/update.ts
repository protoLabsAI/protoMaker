/**
 * PUT /api/automations/:id - Update an automation (enable/disable, change schedule, etc.)
 */

import type { Request, Response } from 'express';
import type {
  AutomationService,
  UpdateAutomationInput,
} from '../../../services/automation-service.js';

export function createUpdateHandler(automationService: AutomationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const input = req.body as UpdateAutomationInput;

      const updated = await automationService.update(id, input);
      if (!updated) {
        res.status(404).json({ error: `Automation not found: ${id}` });
        return;
      }
      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('Invalid cron') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  };
}
