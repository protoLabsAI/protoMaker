/**
 * POST /api/automations/create - Create a new automation
 */

import type { Request, Response } from 'express';
import type {
  AutomationService,
  CreateAutomationInput,
} from '../../../services/automation-service.js';

export function createCreateHandler(automationService: AutomationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const input = req.body as CreateAutomationInput;

      if (!input.name || typeof input.name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (!input.flowId || typeof input.flowId !== 'string') {
        res.status(400).json({ error: 'flowId is required' });
        return;
      }

      const automation = await automationService.create(input);
      res.status(201).json(automation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('Invalid cron') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  };
}
