import type { RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@protolabs-ai/utils';
import { researchRepo } from '../../../services/repo-research-service.js';
import type { RepoResearchResult } from '@protolabs-ai/types';

const logger = createLogger('setup:research');

interface ResearchRequest {
  projectPath: string;
}

interface ResearchResponse {
  success: boolean;
  research?: RepoResearchResult;
  error?: string;
}

/**
 * POST /api/setup/research
 * Scan a repository to detect its current tech stack and structure.
 */
export function createResearchHandler(): RequestHandler<
  unknown,
  ResearchResponse,
  ResearchRequest
> {
  return async (req, res) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const absolutePath = path.resolve(projectPath);

      // Validate path exists and is a directory
      try {
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
          res
            .status(400)
            .json({ success: false, error: `Path is not a directory: ${absolutePath}` });
          return;
        }
      } catch {
        res.status(400).json({ success: false, error: `Path does not exist: ${absolutePath}` });
        return;
      }

      logger.info('Starting repo research', { projectPath: absolutePath });
      const research = await researchRepo(absolutePath);

      res.json({ success: true, research });
    } catch (error) {
      logger.error('Research failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
