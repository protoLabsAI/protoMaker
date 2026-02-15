/**
 * POST /submit-prd endpoint - Submit a SPARC PRD from Chief of Staff
 *
 * This endpoint allows the Chief of Staff (Ava) to submit a SPARC PRD
 * that will be automatically picked up by the Project Manager (ProjM) agent
 * for milestone planning and feature decomposition.
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { AuthorityAgents } from '../index.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage } from '../../common.js';

const logger = createLogger('CoSRoutes:SubmitPRD');

interface SubmitPrdPayload {
  projectPath: string;
  title: string;
  description: string;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  category?: string;
  milestones?: Array<{
    title: string;
    description: string;
  }>;
}

export function createSubmitPrdHandler(
  events: EventEmitter,
  featureLoader: FeatureLoader,
  agents: AuthorityAgents,
  settingsService?: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = req.body as SubmitPrdPayload;
      const { projectPath, title, description, complexity, category, milestones } = payload;

      // Validate required fields
      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!title) {
        res.status(400).json({
          success: false,
          error: 'title is required',
        });
        return;
      }

      if (!description) {
        res.status(400).json({
          success: false,
          error: 'description is required',
        });
        return;
      }

      // Validate complexity if provided
      const VALID_COMPLEXITIES = ['small', 'medium', 'large', 'architectural'] as const;
      if (
        complexity &&
        !VALID_COMPLEXITIES.includes(complexity as (typeof VALID_COMPLEXITIES)[number])
      ) {
        res.status(400).json({
          success: false,
          error: `complexity must be one of: ${VALID_COMPLEXITIES.join(', ')}`,
        });
        return;
      }

      // Validate milestones if provided
      if (milestones) {
        if (!Array.isArray(milestones)) {
          res.status(400).json({
            success: false,
            error: 'milestones must be an array',
          });
          return;
        }

        for (const milestone of milestones) {
          if (!milestone.title || !milestone.description) {
            res.status(400).json({
              success: false,
              error: 'Each milestone must have title and description',
            });
            return;
          }
        }
      }

      // Initialize all authority agents for this project
      // This is CRITICAL - agents must be initialized before emitting events
      logger.info(`Initializing authority agents for project: ${projectPath}`);

      if (agents?.pm) {
        try {
          await agents.pm.initialize(projectPath);
          logger.info(`[CoSRoutes:SubmitPRD] PM agent initialized successfully`);
        } catch (error) {
          logger.error(`[CoSRoutes:SubmitPRD] PM agent initialization failed:`, error);
        }
      }

      if (agents?.projm) {
        try {
          await agents.projm.initialize(projectPath);
          logger.info(`[CoSRoutes:SubmitPRD] ProjM agent initialized successfully`);
        } catch (error) {
          logger.error(`[CoSRoutes:SubmitPRD] ProjM agent initialization failed:`, error);
        }
      }

      if (agents?.em) {
        try {
          await agents.em.initialize(projectPath);
          logger.info(`[CoSRoutes:SubmitPRD] EM agent initialized successfully`);
        } catch (error) {
          logger.error(`[CoSRoutes:SubmitPRD] EM agent initialization failed:`, error);
        }
      }

      if (agents?.statusMonitor) {
        try {
          await agents.statusMonitor.initialize(projectPath);
          logger.info(`[CoSRoutes:SubmitPRD] Status Monitor initialized successfully`);
        } catch (error) {
          logger.error(`[CoSRoutes:SubmitPRD] Status Monitor initialization failed:`, error);
        }
      }

      // Evaluate trust boundary to determine if HITL gates should auto-pass
      let trustBoundaryResult: 'autoApprove' | 'requireReview' = 'requireReview';
      if (settingsService) {
        trustBoundaryResult = settingsService.evaluateTrustBoundary({
          category: category || 'feature',
          complexity: complexity || 'medium',
        });
        logger.info(
          `Trust boundary evaluation: ${trustBoundaryResult} (category=${category || 'feature'}, complexity=${complexity || 'medium'})`
        );
      }

      // Create feature as an epic with approved state
      const feature = await featureLoader.create(projectPath, {
        title,
        description,
        status: 'backlog',
        workItemState: 'approved',
        isEpic: true,
        epicColor: '#6366f1',
        category: 'CoS Projects',
        complexity: complexity || 'medium',
      });

      logger.info(`Created epic feature: ${feature.id} for PRD: "${title}"`);

      // Emit authority:pm-review-approved event for ProjM to pick up
      // This is the EXACT event that ProjM listens for (see projm-agent.ts:62)
      try {
        events.emit('authority:pm-review-approved', {
          projectPath,
          featureId: feature.id,
          complexity: complexity || 'medium',
          milestones: milestones || [],
          trustBoundaryResult,
        });

        // Also emit cos:prd-submitted for tracking
        events.emit('cos:prd-submitted', {
          projectPath,
          featureId: feature.id,
          title,
          milestoneCount: milestones?.length || 0,
          trustBoundaryResult,
        });
      } catch (emitError) {
        logger.warn(
          `Event emission failed after feature creation (featureId: ${feature.id}): ${emitError}`
        );
      }

      logger.info(
        `Emitted authority:pm-review-approved for feature ${feature.id} with ${milestones?.length || 0} milestones`
      );

      res.json({
        success: true,
        featureId: feature.id,
        trustBoundaryResult,
        message:
          trustBoundaryResult === 'autoApprove'
            ? `PRD "${title}" auto-approved by trust boundary. HITL gates will be bypassed.`
            : `PRD "${title}" submitted for review. HITL gates will pause for human approval.`,
      });
    } catch (error) {
      logger.error('Failed to submit PRD:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
