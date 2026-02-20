/**
 * POST /api/hitl-forms/create - Create a new HITL form request
 *
 * Request body: HITLFormRequestInput
 * Response: { success: true, form: HITLFormRequest }
 */

import type { Request, Response } from 'express';
import type { HITLFormService } from '../../../services/hitl-form-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createCreateHandler(hitlFormService: HITLFormService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
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
