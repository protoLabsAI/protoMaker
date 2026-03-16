/**
 * POST /rebuild endpoint - Rebuild knowledge store index
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { KnowledgeStoreService } from '../../../services/knowledge-store-service.js';

const logger = createLogger('KnowledgeRoutes');

interface RebuildRequest {
  projectPath: string;
}

const PRUNE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createRebuildHandler(knowledgeStoreService: KnowledgeStoreService) {
  return async (req: Request, res: Response): Promise<void> => {
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

      // Prune stale chunks if >7 days since last prune (or never pruned)
      const shouldPrune =
        !stats.lastPruneAt ||
        Date.now() - new Date(stats.lastPruneAt).getTime() > PRUNE_INTERVAL_MS;

      let pruneResult: { prunedCount: number } | undefined;
      if (shouldPrune) {
        try {
          logger.info('Running stale chunk prune (>7 days since last prune)', { projectPath });
          const prunedCount = knowledgeStoreService.pruneStaleChunks(projectPath);
          if (prunedCount > 0) {
            // Rebuild index after pruning to keep FTS5 in sync
            knowledgeStoreService.rebuildIndex(projectPath);
          }
          pruneResult = { prunedCount };
        } catch (pruneError) {
          logger.warn('Stale chunk prune failed:', pruneError);
        }
      }

      const finalStats = knowledgeStoreService.getStats();
      res.json({ success: true, stats: finalStats, ...(pruneResult && { pruneResult }) });
    } catch (error) {
      logger.error('Rebuild index failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
