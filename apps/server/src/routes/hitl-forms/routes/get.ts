/**
 * POST /api/hitl-forms/get - Get a HITL form by ID
 *
 * Request body: { formId: string }
 * Response: { success: true, form: HITLFormRequest }
 */

import type { Request, Response } from 'express';
import type { HITLFormService } from '../../../services/hitl-form-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetHandler(hitlFormService: HITLFormService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { formId } = req.body;

      if (!formId || typeof formId !== 'string') {
        res.status(400).json({ success: false, error: 'formId is required' });
        return;
      }

      const form = hitlFormService.get(formId);
      if (!form) {
        res.status(404).json({ success: false, error: `Form not found: ${formId}` });
        return;
      }

      res.json({ success: true, form });
    } catch (error) {
      logError(error, 'Get HITL form failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
