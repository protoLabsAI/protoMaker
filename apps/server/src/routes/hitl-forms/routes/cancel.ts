/**
 * POST /api/hitl-forms/cancel - Cancel a pending HITL form
 *
 * Request body: { formId: string }
 * Response: { success: true, form: HITLFormRequest }
 */

import type { Request, Response } from 'express';
import type { HITLFormService } from '../../../services/hitl-form-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createCancelHandler(hitlFormService: HITLFormService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { formId } = req.body;

      if (!formId || typeof formId !== 'string') {
        res.status(400).json({ success: false, error: 'formId is required' });
        return;
      }

      const form = await hitlFormService.cancel(formId);

      res.json({ success: true, form });
    } catch (error) {
      logError(error, 'Cancel HITL form failed');
      const status = (error as Error).message?.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
