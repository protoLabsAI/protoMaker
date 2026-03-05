/**
 * GET /api/automations/list - List all automations
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createListHandler(automationService: AutomationService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const automations = await automationService.list();
      const schedulerMap = automationService.getSchedulerStatusMap();
      const result = automations.map((automation) => ({
        ...automation,
        schedulerStats: schedulerMap.get(automation.id) ?? null,
      }));
      res.json({ automations: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  };
}
