/**
 * Dashboard Routes - System health and status endpoints
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutoModeService } from '../services/auto-mode-service.js';
import type { CrewLoopService } from '../services/crew-loop-service.js';

const logger = createLogger('DashboardRoutes');

export function createDashboardRoutes(
  autoModeService: AutoModeService,
  crewLoopService: CrewLoopService
): Router {
  const router = Router();

  /**
   * POST /api/system/health-dashboard
   * Get comprehensive system health including memory, CPU, heap, agent count, auto-mode status, crew status
   */
  router.post('/health-dashboard', async (req: Request, res: Response) => {
    try {
      // Get memory and CPU metrics
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Get auto-mode status (no arguments)
      const autoModeStatus = autoModeService.getStatus();

      // Get crew status
      let crewStatus = null;
      try {
        crewStatus = crewLoopService.getStatus();
      } catch (error) {
        logger.warn('Failed to get crew status:', error);
      }

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
          count: autoModeStatus.runningCount,
          active: autoModeStatus.runningFeatures,
        },
        autoMode: {
          isRunning: autoModeStatus.isRunning,
          runningCount: autoModeStatus.runningCount,
          runningFeatures: autoModeStatus.runningFeatures,
        },
        crew: crewStatus,
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
