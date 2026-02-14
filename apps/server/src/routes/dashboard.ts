/**
 * Dashboard Routes - System health and status endpoints
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutoModeService } from '../services/auto-mode-service.js';
import type { CrewService } from '../services/crew-service.js';

const logger = createLogger('DashboardRoutes');

export function createDashboardRoutes(
  autoModeService: AutoModeService,
  crewService: CrewService
): Router {
  const router = Router();

  /**
   * POST /api/system/health-dashboard
   * Get comprehensive system health including memory, CPU, heap, agent count, auto-mode status, crew status
   */
  router.post('/health-dashboard', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      // Get memory and CPU metrics
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Get auto-mode status
      let autoModeStatus = null;
      if (projectPath) {
        try {
          autoModeStatus = await autoModeService.getStatus(projectPath);
        } catch (error) {
          logger.warn('Failed to get auto-mode status:', error);
        }
      }

      // Get crew status
      let crewStatus = null;
      try {
        crewStatus = await crewService.getStatus();
      } catch (error) {
        logger.warn('Failed to get crew status:', error);
      }

      // Count active agents from auto-mode
      const agentCount = autoModeStatus?.activeFeatures?.length ?? 0;

      res.json({
        success: true,
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
          external: memoryUsage.external,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        heap: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        },
        agents: {
          count: agentCount,
          active: autoModeStatus?.activeFeatures ?? [],
        },
        autoMode: {
          running: autoModeStatus?.running ?? false,
          capacity: autoModeStatus?.capacity,
          projectPath: autoModeStatus?.projectPath,
        },
        crew: {
          enabled: crewStatus?.enabled ?? false,
          running: crewStatus?.running ?? false,
          lastRun: crewStatus?.lastRun,
          nextRun: crewStatus?.nextRun,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get system health:', error);
      res.status(500).json({ error: 'Failed to get system health' });
    }
  });

  return router;
}
