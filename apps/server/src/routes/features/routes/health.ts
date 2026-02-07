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
      const { projectPath, autoFix } = req.body as {
        projectPath: unknown;
        autoFix?: unknown;
      };

      // Validate projectPath is a non-empty string
      if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'projectPath must be a non-empty string',
        });
        return;
      }

      // Validate autoFix is a boolean or undefined
      if (autoFix !== undefined && typeof autoFix !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'autoFix must be a boolean if provided',
        });
        return;
      }

      const report = await healthService.audit(projectPath, autoFix ?? false);

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
