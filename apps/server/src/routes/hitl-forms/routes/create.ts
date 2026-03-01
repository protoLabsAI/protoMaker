/**
 * POST /api/hitl-forms/create - Create a new HITL form request
 *
 * Request body: HITLFormRequestInput
 * Response: { success: true, form: HITLFormRequest }
 */

import type { Request, Response } from 'express';
import type { HITLFormService } from '../../../services/hitl-form-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('HITLCreateRoute');

export function createCreateHandler(
  hitlFormService: HITLFormService,
  settingsService?: SettingsService | null
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Check featureFlags.pipeline — HITL form creation is gated behind this flag
      let hitlEnabled = false;
      if (settingsService) {
        try {
          const globalSettings = await settingsService.getGlobalSettings();
          hitlEnabled = globalSettings.featureFlags?.pipeline ?? false;
        } catch (err) {
          logger.warn('Failed to read feature flags, HITL disabled:', err);
        }
      }

      if (!hitlEnabled) {
        logger.debug('HITL forms disabled (featureFlags.pipeline=false), skipping');
        res
          .status(403)
          .json({ success: false, error: 'HITL forms are disabled (featureFlags.pipeline=false)' });
        return;
      }

      const {
        title,
        description,
        steps,
        callerType,
        featureId,
        projectPath,
        flowThreadId,
        ttlSeconds,
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }

      if (!steps || !Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ success: false, error: 'at least one step is required' });
        return;
      }

      if (!callerType || !['agent', 'flow', 'api'].includes(callerType)) {
        res.status(400).json({ success: false, error: 'callerType must be agent, flow, or api' });
        return;
      }

      const form = hitlFormService.create({
        title,
        description,
        steps,
        callerType,
        featureId,
        projectPath,
        flowThreadId,
        ttlSeconds,
      });

      res.json({ success: true, form });
    } catch (error) {
      logError(error, 'Create HITL form failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
