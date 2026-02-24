/**
 * POST /rebuild endpoint - Rebuild knowledge store index
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { KnowledgeStoreService } from '../../../services/knowledge-store-service.js';

const logger = createLogger('KnowledgeRoutes');

interface RebuildRequest {
  projectPath: string;
}

export function createRebuildHandler(knowledgeStoreService: KnowledgeStoreService) {
  return (req: Request, res: Response): void => {
    try {
      const { projectPath } = req.body as RebuildRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.info('Rebuild index request', { projectPath });

      // Initialize for this project path (re-initializes if different)
      knowledgeStoreService.initialize(projectPath);

      knowledgeStoreService.rebuildIndex(projectPath);
      const stats = knowledgeStoreService.getStats();

      res.json({ success: true, stats });
    } catch (error) {
      logger.error('Rebuild index failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
