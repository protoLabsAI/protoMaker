/**
 * Resume Interrupted Features Handler
 *
 * Checks for features that were interrupted (in pipeline steps or in_progress)
 * when the server was restarted and resumes them.
 * After resuming, triggers a non-blocking crash recovery scan to detect and recover
 * uncommitted/unpushed work.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { scanWorktreesForCrashRecovery } from '../../../services/maintenance-tasks.js';

const logger = createLogger('ResumeInterrupted');

interface ResumeInterruptedRequest {
  projectPath: string;
}

export function createResumeInterruptedHandler(
  autoModeService: AutoModeService,
  featureLoader: FeatureLoader,
  settingsService: SettingsService,
  events?: EventEmitter
) {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath } = req.body as ResumeInterruptedRequest;

    if (!projectPath) {
      res.status(400).json({ error: 'Project path is required' });
      return;
    }

    logger.info(`Checking for interrupted features in ${projectPath}`);

    try {
      await autoModeService.resumeInterruptedFeatures(projectPath);
      res.json({
        success: true,
        message: 'Resume check completed',
      });

      // Run crash recovery scan non-blocking (after response is sent)
      if (events) {
        // Use setImmediate to ensure response is sent first
        setImmediate(() => {
          scanWorktreesForCrashRecovery(projectPath, featureLoader, settingsService, events).catch(
            (error) => {
              logger.error('Crash recovery scan failed:', error);
            }
          );
        });
      } else {
        logger.debug('Events emitter not available, skipping crash recovery scan');
      }
    } catch (error) {
      logger.error('Error resuming interrupted features:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
