/**
 * POST /api/hitl-forms/submit - Submit a response to a HITL form
 *
 * Request body: { formId: string, response: Record<string, unknown>[] }
 * Response: { success: true, form: HITLFormRequest }
 */

import type { Request, Response } from 'express';
import type { HITLFormService } from '../../../services/hitl-form-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createSubmitHandler(hitlFormService: HITLFormService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { formId, response } = req.body;

      if (!formId || typeof formId !== 'string') {
        res.status(400).json({ success: false, error: 'formId is required' });
        return;
      }

      if (!response || !Array.isArray(response)) {
        res.status(400).json({ success: false, error: 'response must be an array' });
        return;
      }

      const form = await hitlFormService.submit(formId, response);

      res.json({ success: true, form });
    } catch (error) {
      logError(error, 'Submit HITL form failed');
      const status = (error as Error).message?.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
