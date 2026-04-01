import type { RequestHandler } from 'express';
import { createLogger } from '@protolabsai/utils';
import { generateProposal } from '../../../services/alignment-proposal-service.js';
import type { GapAnalysisReport, AlignmentProposal } from '@protolabsai/types';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';

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
export function createProposeHandler(
  featureLoader?: FeatureLoader,
  events?: EventEmitter
): RequestHandler<unknown, ProposeResponse, ProposeRequest> {
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

      if (!featureLoader) {
        res.status(500).json({
          success: false,
          error: 'autoCreate requires featureLoader — server misconfiguration',
        });
        return;
      }

      // Create each alignment feature on the board
      let featuresCreated = 0;
      for (const milestone of proposal.milestones) {
        for (const alignmentFeature of milestone.features) {
          const created = await featureLoader.create(projectPath, {
            title: alignmentFeature.title,
            description: alignmentFeature.description,
            complexity: alignmentFeature.complexity,
            priority: alignmentFeature.priority as 0 | 1 | 2 | 3 | 4,
            status: 'backlog',
            source: 'internal',
          });

          if (events) {
            events.broadcast('feature:created', {
              featureId: created.id,
              featureName: created.title,
              projectPath,
              feature: created,
            });
          }

          featuresCreated++;
        }
      }

      logger.info('Alignment features created', { projectPath, featuresCreated });

      res.json({
        success: true,
        proposal,
        featuresCreated,
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
