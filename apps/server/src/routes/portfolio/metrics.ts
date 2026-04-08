/**
 * Portfolio Metrics Route — Aggregated cost, throughput, and flow efficiency.
 * GET /api/portfolio/metrics
 *
 * Returns PortfolioMetrics across all registered projects (or a provided subset).
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { MetricsService } from '../../services/metrics-service.js';

const logger = createLogger('PortfolioMetricsRoute');

interface PortfolioMetricsOptions {
  settingsService: SettingsService;
  metricsService: MetricsService;
}

export function createPortfolioMetricsRoutes({
  settingsService,
  metricsService,
}: PortfolioMetricsOptions): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      let projectPaths: string[];

      if (req.query.projectPaths !== undefined) {
        const raw = req.query.projectPaths;
        if (Array.isArray(raw)) {
          projectPaths = raw.map(String).filter(Boolean);
        } else {
          projectPaths = String(raw)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        }
      } else {
        const settings = await settingsService.getGlobalSettings();
        const refs = settings.projects ?? [];
        projectPaths = refs.map((p) => p.path).filter(Boolean);
      }

      const windowDays = req.query.windowDays ? Number(req.query.windowDays) : 7;
      const metrics = await metricsService.getPortfolioMetrics(projectPaths, windowDays);
      res.json(metrics);
    } catch (err) {
      logger.error('Portfolio metrics failed:', err);
      res.status(500).json({ error: 'Failed to compute portfolio metrics' });
    }
  });

  return router;
}
