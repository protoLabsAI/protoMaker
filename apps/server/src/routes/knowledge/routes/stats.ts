/**
 * POST /stats endpoint - Get knowledge store statistics
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { KnowledgeStoreService } from '../../../services/knowledge-store-service.js';

const logger = createLogger('KnowledgeRoutes');

interface StatsRequest {
  projectPath: string;
}

export function createStatsHandler(knowledgeStoreService: KnowledgeStoreService) {
  return (req: Request, res: Response): void => {
    try {
      const { projectPath } = req.body as StatsRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.debug('Stats request', { projectPath });

      // Initialize for this project path (re-initializes if different)
      knowledgeStoreService.initialize(projectPath);

      const stats = knowledgeStoreService.getStats();
      const domainBreakdown = knowledgeStoreService.getStatsByDomain(projectPath);

      res.json({ success: true, stats, domainBreakdown });
    } catch (error) {
      logger.error('Get stats failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
