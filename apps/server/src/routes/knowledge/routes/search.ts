/**
 * POST /search endpoint - Search knowledge store
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('KnowledgeRoutes');

interface SearchRequest {
  projectPath: string;
  query: string;
  maxResults?: number;
  maxTokens?: number;
  sourceTypes?: string[];
}

export function createSearchHandler(knowledgeStoreService: any) {
  return (req: Request, res: Response): void => {
    try {
      const { projectPath, query, maxResults, maxTokens, sourceTypes } = req.body as SearchRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!query) {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      logger.debug('Search request', { projectPath, query, maxResults, maxTokens, sourceTypes });

      // Initialize for this project path (re-initializes if different)
      knowledgeStoreService.initialize(projectPath);

      const results = knowledgeStoreService.search(projectPath, query, {
        maxResults,
        maxTokens,
        sourceTypes: sourceTypes ?? 'all',
      });

      res.json({ success: true, results });
    } catch (error) {
      logger.error('Search failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
