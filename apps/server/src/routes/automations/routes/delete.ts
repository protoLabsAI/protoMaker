/**
 * DELETE /api/automations/:id - Delete an automation
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createDeleteHandler(automationService: AutomationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const deleted = await automationService.delete(id);
      if (!deleted) {
        res.status(404).json({ error: `Automation not found: ${id}` });
        return;
      }
      res.json({ success: true, id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  };
}
