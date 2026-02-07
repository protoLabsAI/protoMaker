/**
 * POST /health endpoint - Run board health audit
 *
 * Body: { projectPath: string, autoFix?: boolean }
 * Returns: HealthReport with issues found and any auto-fixes applied
 */

import type { Request, Response } from 'express';
import type { FeatureHealthService } from '../../../services/feature-health-service.js';

export function createHealthHandler(healthService: FeatureHealthService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, autoFix = false } = req.body as {
        projectPath: string;
        autoFix?: boolean;
      };

      const report = await healthService.audit(projectPath, autoFix);

      res.json({
        success: true,
        report,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}
