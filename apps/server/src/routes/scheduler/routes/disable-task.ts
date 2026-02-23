/**
 * POST /api/scheduler/tasks/:taskId/disable - Disable a scheduler task
 */

import type { Request, Response } from 'express';
import type { SchedulerService } from '../../../services/scheduler-service.js';
import type { SettingsService } from '../../../services/settings-service.js';

export function createDisableTaskHandler(
  schedulerService: SchedulerService,
  settingsService: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const taskId = req.params.taskId as string;

      const success = await schedulerService.disableTask(taskId);
      if (!success) {
        res.status(404).json({ success: false, error: `Task not found: ${taskId}` });
        return;
      }

      // Persist to GlobalSettings
      const settings = await settingsService.getGlobalSettings();
      const maintenance = settings.maintenance ?? { enabled: true };
      const tasks = maintenance.tasks ?? {};
      tasks[taskId] = { ...tasks[taskId], enabled: false };
      maintenance.tasks = tasks;
      await settingsService.updateGlobalSettings({ maintenance });

      res.json({ success: true, taskId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMessage });
    }
  };
}
