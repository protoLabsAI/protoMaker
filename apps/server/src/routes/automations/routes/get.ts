/**
 * GET /api/automations/:id - Get a single automation by ID
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createGetHandler(automationService: AutomationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const automation = await automationService.get(id);
      if (!automation) {
        res.status(404).json({ error: `Automation not found: ${id}` });
        return;
      }
      res.json(automation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  };
}
