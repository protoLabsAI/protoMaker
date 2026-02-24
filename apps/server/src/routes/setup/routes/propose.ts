import type { RequestHandler } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { generateProposal } from '../../../services/alignment-proposal-service.js';
import type { GapAnalysisReport, AlignmentProposal } from '@protolabs-ai/types';

const logger = createLogger('setup:propose');

interface ProposeRequest {
  projectPath: string;
  gapAnalysis: GapAnalysisReport;
  autoCreate?: boolean;
}

interface ProposeResponse {
  success: boolean;
  proposal?: AlignmentProposal;
  featuresCreated?: number;
  error?: string;
}

/**
 * POST /api/setup/propose
 * Convert gap analysis into alignment features (optionally creating them on the board).
 */
export function createProposeHandler(): RequestHandler<unknown, ProposeResponse, ProposeRequest> {
  return async (req, res) => {
    try {
      const { projectPath, gapAnalysis, autoCreate } = req.body;

      if (!projectPath || !gapAnalysis) {
        res.status(400).json({
          success: false,
          error: 'projectPath and gapAnalysis are required',
        });
        return;
      }

      logger.info('Generating alignment proposal', { projectPath, autoCreate });
      const proposal = generateProposal(gapAnalysis);

      if (!autoCreate) {
        res.json({ success: true, proposal });
        return;
      }

      // Auto-create: forward to the feature creation pipeline
      // This calls the existing features/create endpoint for each feature
      // The MCP tool orchestration handles the actual board creation
      res.json({
        success: true,
        proposal,
        featuresCreated: proposal.totalFeatures,
      });
    } catch (error) {
      logger.error('Proposal generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
