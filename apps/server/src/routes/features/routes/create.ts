/**
 * POST /create endpoint - Create a new feature
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { Feature } from '@protolabs-ai/types';
import { getErrorMessage, logError } from '../common.js';
import { TrustTierService } from '../../../services/trust-tier-service.js';
import { QuarantineService } from '../../../services/quarantine-service.js';
import type { QuarantineStage, SanitizationViolation } from '@protolabs-ai/types';

/**
 * Determine the feature source from request headers and authentication method
 */
function determineSource(req: Request): Feature['source'] {
  // Check for MCP client header
  const mcpClient = req.headers['x-automaker-client'];
  if (mcpClient === 'mcp') {
    return 'mcp';
  }

  // Check authentication method
  // X-API-Key header → 'api'
  if (req.headers['x-api-key']) {
    return 'api';
  }

  // Session token (X-Session-Token or cookie) → 'ui'
  if (req.headers['x-session-token'] || req.cookies?.automaker_session) {
    return 'ui';
  }

  // Default to 'internal' if no clear authentication method
  return 'internal';
}

export function createCreateHandler(
  featureLoader: FeatureLoader,
  trustTierService: TrustTierService,
  events?: EventEmitter
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, feature } = req.body as {
        projectPath: string;
        feature: Partial<Feature>;
      };

      if (!projectPath || !feature) {
        res.status(400).json({
          success: false,
          error: 'projectPath and feature are required',
        });
        return;
      }

      // Validate that feature has title and description for quarantine processing
      if (!feature.title || !feature.description) {
        res.status(400).json({
          success: false,
          error: 'feature.title and feature.description are required',
        });
        return;
      }

      // Check for duplicate title if title is provided
      if (feature.title && feature.title.trim()) {
        const duplicate = await featureLoader.findDuplicateTitle(projectPath, feature.title);
        if (duplicate) {
          res.status(409).json({
            success: false,
            error: `A feature with title "${feature.title}" already exists`,
            duplicateFeatureId: duplicate.id,
          });
          return;
        }
      }

      // Determine source from request context
      const source = determineSource(req);

      // Get trust tier from TrustTierService
      const trustTier = trustTierService.classifyTrust(source);

      // Process through quarantine pipeline
      const quarantineService = new QuarantineService(trustTierService, projectPath);
      const outcome = await quarantineService.process({
        title: feature.title,
        description: feature.description,
        source,
        trustTier,
      });

      // If quarantine failed, return HTTP 422
      if (!outcome.approved) {
        res.status(422).json({
          error: 'quarantine_failed',
          quarantineId: outcome.entry.id,
          stage: outcome.entry.stage as QuarantineStage,
          violations: outcome.entry.violations as SanitizationViolation[],
        });
        return;
      }

      // Use sanitized title and description from quarantine outcome
      const sanitizedFeature: Partial<Feature> = {
        ...feature,
        title: outcome.sanitizedTitle,
        description: outcome.sanitizedDescription,
        source,
        trustTier,
        quarantineStatus: outcome.entry.result,
        quarantineId: outcome.entry.id,
      };

      const created = await featureLoader.create(projectPath, sanitizedFeature);

      // Emit feature_created event for hooks
      if (events) {
        events.emit('feature:created', {
          featureId: created.id,
          featureName: created.title,
          projectPath,
        });
      }

      res.json({ success: true, feature: created });
    } catch (error) {
      logError(error, 'Create feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
