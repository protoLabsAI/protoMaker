/**
 * GET /api/automations/list - List all automations
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createListHandler(automationService: AutomationService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const automations = await automationService.list();
      res.json({ automations });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  };
}
