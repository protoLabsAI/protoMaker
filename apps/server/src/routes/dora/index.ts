import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';

export function createDoraRoutes(doraMetricsService: DoraMetricsService): Router {
  const router = Router();

  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const timeWindowDays = req.query.timeWindowDays
        ? parseInt(req.query.timeWindowDays as string, 10)
        : undefined;

      if (timeWindowDays !== undefined && (isNaN(timeWindowDays) || timeWindowDays < 1)) {
        res
          .status(400)
          .json({ success: false, error: 'timeWindowDays must be a positive integer' });
        return;
      }

      const metrics = await doraMetricsService.getMetrics(projectPath, timeWindowDays);
      const alerts = doraMetricsService.evaluateRegulation(metrics);

      res.json({ success: true, metrics, alerts });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
