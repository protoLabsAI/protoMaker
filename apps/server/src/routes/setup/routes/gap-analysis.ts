import type { RequestHandler } from 'express';
import { createLogger } from '@automaker/utils';
import { analyzeGaps } from '../../../services/gap-analysis-service.js';
import type { RepoResearchResult, GapAnalysisReport } from '@automaker/types';

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
 * POST /api/setup/gap-analysis
 * Compare research results against the ProtoLabs gold standard.
 */
export function createGapAnalysisHandler(): RequestHandler<
  unknown,
  GapAnalysisResponse,
  GapAnalysisRequest
> {
  return async (req, res) => {
    try {
      const { projectPath, research, skipChecks } = req.body;

      if (!projectPath || !research) {
        res.status(400).json({
          success: false,
          error: 'projectPath and research are required',
        });
        return;
      }

      logger.info('Running gap analysis', { projectPath });
      const report = analyzeGaps(research, skipChecks);

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
