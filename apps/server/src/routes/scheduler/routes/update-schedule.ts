/**
 * POST /api/scheduler/tasks/:taskId/schedule - Update a task's cron schedule
 */

import type { Request, Response } from 'express';
import type { SchedulerService } from '../../../services/scheduler-service.js';

export function createUpdateScheduleHandler(schedulerService: SchedulerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = req.params.taskId as string;
      const cronExpression = req.body?.cronExpression as string | undefined;

      if (!cronExpression || typeof cronExpression !== 'string') {
        res.status(400).json({ success: false, error: 'cronExpression is required' });
        return;
      }

      const success = await schedulerService.updateTaskSchedule(taskId, cronExpression);
      if (!success) {
        res.status(404).json({ success: false, error: `Task not found: ${taskId}` });
        return;
      }

      const task = schedulerService.getTask(taskId);
      res.json({
        success: true,
        taskId,
        cronExpression,
        nextRun: task?.nextRun,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: errorMessage });
    }
  };
}
