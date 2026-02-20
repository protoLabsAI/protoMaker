/**
 * POST /api/hitl-forms/list - List pending HITL forms
 *
 * Request body: { projectPath?: string }
 * Response: { success: true, forms: HITLFormRequestSummary[] }
 */

import type { Request, Response } from 'express';
import type { HITLFormService } from '../../../services/hitl-form-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createListHandler(hitlFormService: HITLFormService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      const forms = hitlFormService.listPending(projectPath);

      res.json({ success: true, forms });
    } catch (error) {
      logError(error, 'List HITL forms failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
