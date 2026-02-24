/**
 * Knowledge routes - HTTP API for knowledge store management
 */

import { Router } from 'express';
import { createSearchHandler } from './routes/search.js';
import { createStatsHandler } from './routes/stats.js';
import { createRebuildHandler } from './routes/rebuild.js';
import {
  createIngestReflectionsHandler,
  createIngestAgentOutputsHandler,
} from './routes/ingest.js';

export function createKnowledgeRoutes(knowledgeStoreService: any): Router {
  const router = Router();

  router.post('/search', createSearchHandler(knowledgeStoreService));
  router.post('/stats', createStatsHandler(knowledgeStoreService));
  router.post('/rebuild', createRebuildHandler(knowledgeStoreService));
  router.post('/ingest/reflections', createIngestReflectionsHandler(knowledgeStoreService));
  router.post('/ingest/agent-outputs', createIngestAgentOutputsHandler(knowledgeStoreService));

  return router;
}
