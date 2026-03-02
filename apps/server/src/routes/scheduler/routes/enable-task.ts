/**
 * POST /api/scheduler/tasks/:taskId/enable - Enable a scheduler task
 */

import type { Request, Response } from 'express';
import type { SchedulerService } from '../../../services/scheduler-service.js';

export function createEnableTaskHandler(schedulerService: SchedulerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = req.params.taskId as string;

      const success = await schedulerService.enableTask(taskId);
      if (!success) {
        res.status(404).json({ success: false, error: `Task not found: ${taskId}` });
        return;
      }

      res.json({ success: true, taskId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMessage });
    }
  };
}
