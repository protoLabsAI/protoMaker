/**
 * Knowledge routes - HTTP API for knowledge store management
 */

import { Router } from 'express';
import type { KnowledgeStoreService } from '../../services/knowledge-store-service.js';
import { createSearchHandler } from './routes/search.js';
import { createStatsHandler } from './routes/stats.js';
import { createRebuildHandler } from './routes/rebuild.js';
import {
  createIngestChunkHandler,
  createIngestReflectionsHandler,
  createIngestAgentOutputsHandler,
} from './routes/ingest.js';
import { createEvalStatsHandler } from './routes/eval-stats.js';

export function createKnowledgeRoutes(knowledgeStoreService: KnowledgeStoreService): Router {
  const router = Router();

  router.post('/search', createSearchHandler(knowledgeStoreService));
  router.post('/stats', createStatsHandler(knowledgeStoreService));
  router.post('/rebuild', createRebuildHandler(knowledgeStoreService));
  router.post('/ingest', createIngestChunkHandler(knowledgeStoreService));
  router.post('/ingest/reflections', createIngestReflectionsHandler(knowledgeStoreService));
  router.post('/ingest/agent-outputs', createIngestAgentOutputsHandler(knowledgeStoreService));
  router.post('/eval-stats', createEvalStatsHandler(knowledgeStoreService));

  return router;
}
