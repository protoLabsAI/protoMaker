/**
 * Workflow Settings Routes
 *
 * GET  /api/settings/workflow — Read workflow settings for a project
 * PUT  /api/settings/workflow — Update workflow settings for a project
 *
 * Workflow settings control pipeline hardening features:
 * goal gates, checkpointing, loop detection, supervisor,
 * retro feedback, cleanup, and signal intake.
 */

import type { Request, Response } from 'express';
import type { WorkflowSettings } from '@protolabsai/types';
import { DEFAULT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import type { SettingsService } from '../../../services/settings-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetWorkflowHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = (req.body ?? {}) as { projectPath?: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const workflow = projectSettings.workflow ?? DEFAULT_WORKFLOW_SETTINGS;

      res.json({ success: true, workflow });
    } catch (error) {
      logError(error, 'Get workflow settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createUpdateWorkflowHandler(
  settingsService: SettingsService,
  events?: EventEmitter
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, workflow } = (req.body ?? {}) as {
        projectPath?: string;
        workflow?: Partial<WorkflowSettings>;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!workflow) {
        res.status(400).json({ success: false, error: 'workflow settings object is required' });
        return;
      }

      // Merge with existing settings
      const existing = await settingsService.getProjectSettings(projectPath);
      const current = existing.workflow ?? DEFAULT_WORKFLOW_SETTINGS;
      const merged: WorkflowSettings = {
        ...current,
        ...workflow,
        pipeline: { ...current.pipeline, ...workflow.pipeline },
        retro: { ...current.retro, ...workflow.retro },
        cleanup: { ...current.cleanup, ...workflow.cleanup },
        signalIntake: { ...current.signalIntake, ...workflow.signalIntake },
        bugs: { ...current.bugs, ...workflow.bugs },
        contextEngine: { enabled: false, ...current.contextEngine, ...workflow.contextEngine },
      };

      await settingsService.updateProjectSettings(projectPath, {
        workflow: merged,
      });

      // Emit event for services to react
      if (events) {
        events.emit('settings:workflow-changed', {
          projectPath,
          workflow: merged,
        });
      }

      res.json({ success: true, workflow: merged });
    } catch (error) {
      logError(error, 'Update workflow settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
