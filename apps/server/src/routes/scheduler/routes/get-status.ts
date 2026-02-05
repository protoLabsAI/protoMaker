/**
 * GET /api/scheduler/status endpoint - Get scheduler status
 *
 * Returns all registered tasks, their schedules, next run times, and execution history.
 * Useful for monitoring and debugging scheduled tasks.
 */

import type { Request, Response } from 'express';
import type { SchedulerService } from '../../../services/scheduler-service.js';

export function createGetStatusHandler(schedulerService: SchedulerService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = schedulerService.getStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  };
}
