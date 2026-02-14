import type { RequestHandler } from 'express';
import { createLogger } from '@automaker/utils';
import { openReport } from '../../../services/report-generator-service.js';

const logger = createLogger('setup:open-report');

interface OpenReportRequest {
  reportPath: string;
}

interface OpenReportResponse {
  success: boolean;
  error?: string;
}

/**
 * POST /api/setup/open-report
 * Open an existing ProtoLabs HTML report in the default browser.
 */
export function createOpenReportHandler(): RequestHandler<
  unknown,
  OpenReportResponse,
  OpenReportRequest
> {
  return async (req, res) => {
    try {
      const { reportPath } = req.body;

      if (!reportPath) {
        res.status(400).json({
          success: false,
          error: 'reportPath is required',
        });
        return;
      }

      logger.info('Opening report', { reportPath });
      await openReport(reportPath);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to open report', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
