/**
 * Portfolio Sitrep Route — Fleet-wide status aggregation.
 * GET /api/portfolio/sitrep
 *
 * Returns a PortfolioSitrep aggregating per-project status in parallel.
 * Projects are sourced from GlobalSettings.projects[] or from the optional
 * projectPaths query parameter.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import { PortfolioWorldStateBuilder } from '../../services/portfolio-world-state-builder.js';

const logger = createLogger('PortfolioSitrepRoute');

const DEFAULT_PORT = process.env.PORT || '3008';
const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

interface PortfolioSitrepOptions {
  settingsService: SettingsService;
}

export function createPortfolioSitrepRoutes({ settingsService }: PortfolioSitrepOptions): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      let projectPaths: string[];

      if (req.query.projectPaths !== undefined) {
        // Prefer explicitly provided projectPaths query param
        const raw = req.query.projectPaths;
        if (Array.isArray(raw)) {
          projectPaths = raw.map(String).filter(Boolean);
        } else {
          projectPaths = String(raw)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        }

        if (projectPaths.length === 0) {
          res.json({
            generatedAt: new Date().toISOString(),
            projects: [],
            portfolioMetrics: {
              totalActiveAgents: 0,
              globalWipUtilization: 0,
              portfolioFlowEfficiency: 0,
              topConstraint: null,
            },
            pendingHumanDecisions: [],
          });
          return;
        }
      } else {
        const settings = await settingsService.getGlobalSettings();
        const refs = settings.projects ?? [];
        projectPaths = refs.map((p) => p.path).filter(Boolean);
      }

      const builder = new PortfolioWorldStateBuilder({
        projectPaths,
        automakerBaseUrl: DEFAULT_BASE_URL,
      });

      const sitrep = await builder.aggregate();
      res.json(sitrep);
    } catch (err) {
      logger.error('Portfolio sitrep failed:', err);
      res.status(500).json({ error: 'Failed to generate portfolio sitrep' });
    }
  });

  return router;
}
