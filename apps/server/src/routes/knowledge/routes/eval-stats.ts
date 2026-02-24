/**
 * POST /eval-stats endpoint - Get evaluation statistics
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { KnowledgeStoreService } from '../../../services/knowledge-store-service.js';

const logger = createLogger('KnowledgeRoutes');

interface EvalStatsRequest {
  projectPath: string;
}

export function createEvalStatsHandler(knowledgeStoreService: KnowledgeStoreService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as EvalStatsRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.debug('Eval stats request', { projectPath });

      // Initialize for this project path
      knowledgeStoreService.initialize(projectPath);

      const stats = await knowledgeStoreService.getEvalStats(projectPath);

      res.json({ success: true, stats });
    } catch (error) {
      logger.error('Eval stats request failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
