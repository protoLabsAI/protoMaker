/**
 * POST /verify-triage-evidence endpoint (#3972)
 *
 * Deterministically verifies that the file paths a triage agent cites as
 * evidence actually exist at the given git ref, and reports whether a
 * closure-equivalent classification (already_fixed, duplicate, ...) is
 * supported. Triage agents must call this before applying any such label.
 */

import type { Request, Response } from 'express';
import { verifyTriageEvidence } from '../../../services/triage-evidence-verifier.js';
import { getErrorMessage, logError } from './common.js';

interface VerifyTriageEvidenceRequest {
  projectPath: string;
  classification?: string;
  citedPaths: string[];
  ref?: string;
}

export function createVerifyTriageEvidenceHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, classification, citedPaths, ref } =
        req.body as VerifyTriageEvidenceRequest;

      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath is required (non-empty string)' });
        return;
      }
      if (!Array.isArray(citedPaths) || citedPaths.some((p) => typeof p !== 'string')) {
        res.status(400).json({
          success: false,
          error: 'citedPaths is required and must be an array of strings',
        });
        return;
      }

      const result = await verifyTriageEvidence({ projectPath, classification, citedPaths, ref });
      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Verify triage evidence failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
