import type { RequestHandler } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { analyzeGaps } from '../../../services/gap-analysis-service.js';
import type { RepoResearchResult, GapAnalysisReport, ProtolabConfig } from '@protolabs-ai/types';
import fs from 'node:fs/promises';
import path from 'node:path';

const logger = createLogger('setup:gap-analysis');

interface GapAnalysisRequest {
  projectPath: string;
  research: RepoResearchResult;
  skipChecks?: string[];
}

interface GapAnalysisResponse {
  success: boolean;
  report?: GapAnalysisReport;
  error?: string;
}

/**
 * Read protolab.config and extract standard.skip array if present.
 * Returns empty array if file doesn't exist or is malformed.
 */
async function getConfigSkipChecks(projectPath: string): Promise<string[]> {
  try {
    const configPath = path.join(projectPath, 'protolab.config');
    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as Partial<ProtolabConfig>;
    if (Array.isArray(config.standard?.skip)) {
      return config.standard.skip;
    }
  } catch {
    // File doesn't exist or is malformed — not an error
  }
  return [];
}

/**
 * POST /api/setup/gap-analysis
 * Compare research results against the ProtoLabs gold standard.
 * Merges skip checks from protolab.config standard.skip with user-provided skipChecks.
 */
export function createGapAnalysisHandler(): RequestHandler<
  unknown,
  GapAnalysisResponse,
  GapAnalysisRequest
> {
  return async (req, res) => {
    try {
      const { projectPath, research, skipChecks = [] } = req.body;

      if (!projectPath || !research) {
        res.status(400).json({
          success: false,
          error: 'projectPath and research are required',
        });
        return;
      }

      // Merge user-provided skipChecks with protolab.config standard.skip
      const configSkips = await getConfigSkipChecks(projectPath);
      const mergedSkips = [...new Set([...skipChecks, ...configSkips])];

      if (configSkips.length > 0) {
        logger.info('Merged protolab.config skip checks', {
          projectPath,
          configSkips,
          totalSkips: mergedSkips.length,
        });
      }

      logger.info('Running gap analysis', { projectPath });
      const report = analyzeGaps(research, mergedSkips);

      res.json({ success: true, report });
    } catch (error) {
      logger.error('Gap analysis failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
