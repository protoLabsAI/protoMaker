/**
 * POST /api/scheduler/tasks/:taskId/trigger - Trigger immediate task execution
 */

import type { Request, Response } from 'express';
import type { SchedulerService } from '../../../services/scheduler-service.js';

export function createTriggerTaskHandler(schedulerService: SchedulerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = req.params.taskId as string;

      const result = await schedulerService.triggerTask(taskId);
      res.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = errorMessage.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ success: false, error: errorMessage });
    }
  };
}
