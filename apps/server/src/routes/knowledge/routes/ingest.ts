/**
 * POST /ingest/* endpoints - Knowledge ingestion routes
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { KnowledgeStoreService } from '../../../services/knowledge-store-service.js';

const logger = createLogger('KnowledgeIngestRoutes');

interface IngestRequest {
  projectPath: string;
}

interface IngestChunkRequest {
  projectPath: string;
  content: string;
  domain: string;
  heading?: string;
}

/**
 * POST /ingest - Ingest a raw text chunk with a required domain tag
 */
export function createIngestChunkHandler(knowledgeStoreService: KnowledgeStoreService) {
  return (req: Request, res: Response): void => {
    try {
      const { projectPath, content, domain, heading } = req.body as IngestChunkRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!content) {
        res.status(400).json({ success: false, error: 'content is required' });
        return;
      }

      if (!domain) {
        res.status(400).json({ success: false, error: 'domain is required' });
        return;
      }

      logger.info('Ingest chunk request', { projectPath, domain });

      // Initialize for this project path
      knowledgeStoreService.initialize(projectPath);

      const chunkId = knowledgeStoreService.ingestChunk(projectPath, content, domain, heading);

      res.json({ success: true, chunkId });
    } catch (error) {
      logger.error('Ingest chunk failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /ingest/reflections - Ingest all reflection.md files from features
 */
export function createIngestReflectionsHandler(knowledgeStoreService: KnowledgeStoreService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as IngestRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.info('Ingest reflections request', { projectPath });

      // Initialize for this project path
      knowledgeStoreService.initialize(projectPath);

      const count = await knowledgeStoreService.ingestReflections(projectPath);

      res.json({ success: true, count });
    } catch (error) {
      logger.error('Ingest reflections failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /ingest/agent-outputs - Ingest all agent-output.md files from features
 */
export function createIngestAgentOutputsHandler(knowledgeStoreService: KnowledgeStoreService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as IngestRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.info('Ingest agent outputs request', { projectPath });

      // Initialize for this project path
      knowledgeStoreService.initialize(projectPath);

      const count = await knowledgeStoreService.ingestAgentOutputs(projectPath);

      res.json({ success: true, count });
    } catch (error) {
      logger.error('Ingest agent outputs failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
