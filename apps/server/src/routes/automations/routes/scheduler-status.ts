/**
 * GET /api/automations/scheduler/status - Return all scheduler task states
 */

import type { Request, Response } from 'express';
import type { AutomationService } from '../../../services/automation-service.js';

export function createSchedulerStatusHandler(automationService: AutomationService) {
  return (_req: Request, res: Response): void => {
    const tasks = automationService.getSchedulerStatus();
    res.json({ tasks });
  };
}
