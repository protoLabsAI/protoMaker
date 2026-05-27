/**
 * POST /run-telemetry — agent self-query of a feature's run telemetry (beads 3um / #3906).
 *
 * Returns a structured digest (attempts, failures, repeated error, cost/turns,
 * remediation cycles, and a looping/escalating signal + hint) so an agent can
 * self-diagnose before declaring done.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';
import { projectPathSchema, featureIdSchema } from '../../../lib/validation.js';
import { summarizeRunTelemetry } from '../../../services/run-telemetry-service.js';

const bodySchema = z.object({
  projectPath: projectPathSchema,
  featureId: featureIdSchema,
});

export function createRunTelemetryHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: parsed.error.issues });
        return;
      }
      const { projectPath, featureId } = parsed.data;
      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ success: false, error: 'Feature not found' });
        return;
      }
      res.json({ success: true, telemetry: summarizeRunTelemetry(feature) });
    } catch (error) {
      logError(error, 'Run telemetry failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
