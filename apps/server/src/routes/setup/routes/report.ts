import type { RequestHandler } from 'express';
import { createLogger } from '@automaker/utils';
import { generateAndSaveReport } from '../../../services/report-generator-service.js';
import type { RepoResearchResult, GapAnalysisReport } from '@automaker/types';

const logger = createLogger('setup:report');

interface ReportRequest {
  projectPath: string;
  research: RepoResearchResult;
  report: GapAnalysisReport;
}

interface ReportResponse {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * POST /api/setup/report
 * Generate a self-contained HTML report from gap analysis and research results.
 * Saves to {projectPath}/protoLabs.report.html
 */
export function createReportHandler(): RequestHandler<unknown, ReportResponse, ReportRequest> {
  return async (req, res) => {
    try {
      const { projectPath, research, report } = req.body;

      if (!projectPath || !research || !report) {
        res.status(400).json({
          success: false,
          error: 'projectPath, research, and report are required',
        });
        return;
      }

      logger.info('Generating report', { projectPath });
      const outputPath = await generateAndSaveReport({ projectPath, research, report });

      res.json({ success: true, outputPath });
    } catch (error) {
      logger.error('Report generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
