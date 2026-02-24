/**
 * Knowledge routes - HTTP API for knowledge store management
 */

import { Router } from 'express';
import { createSearchHandler } from './routes/search.js';
import { createStatsHandler } from './routes/stats.js';
import { createRebuildHandler } from './routes/rebuild.js';

export function createKnowledgeRoutes(knowledgeStoreService: any): Router {
  const router = Router();

  router.post('/search', createSearchHandler(knowledgeStoreService));
  router.post('/stats', createStatsHandler(knowledgeStoreService));
  router.post('/rebuild', createRebuildHandler(knowledgeStoreService));

  return router;
}
