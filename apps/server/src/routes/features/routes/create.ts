/**
 * POST /create endpoint - Create a new feature
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { Feature } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';
import { TrustTierService } from '../../../services/trust-tier-service.js';
import { QuarantineService } from '../../../services/quarantine-service.js';
import type { QuarantineStage, SanitizationViolation } from '@protolabsai/types';

export const CreateRequestSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
  feature: z.custom<Partial<Feature>>(
    (val): val is Partial<Feature> => val !== null && typeof val === 'object',
    'feature must be an object'
  ),
});

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
      const { projectPath, feature }: z.infer<typeof CreateRequestSchema> = req.body;

      // Validate that feature has a description (title is optional — UI auto-generates it)
      if (!feature.description) {
        res.status(400).json({
          success: false,
          error: 'feature.description is required',
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

      // Process through quarantine pipeline (use description truncation as fallback title)
      const quarantineTitle = feature.title?.trim() || feature.description.slice(0, 100);
      const quarantineService = new QuarantineService(trustTierService, projectPath);
      const outcome = await quarantineService.process({
        title: quarantineTitle,
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
      // Preserve original empty title so the UI can auto-generate it client-side
      const sanitizedFeature: Partial<Feature> = {
        ...feature,
        title: feature.title?.trim() ? outcome.sanitizedTitle : (feature.title ?? ''),
        description: outcome.sanitizedDescription,
        source,
        trustTier,
        quarantineStatus: outcome.entry.result,
        quarantineId: outcome.entry.id,
      };

      const created = await featureLoader.create(projectPath, sanitizedFeature);

      // Broadcast feature_created event for hooks + CRDT sync
      if (events) {
        events.broadcast('feature:created', {
          featureId: created.id,
          featureName: created.title,
          projectPath,
          feature: created,
        });
      }

      res.json({ success: true, feature: created });
    } catch (error) {
      logError(error, 'Create feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
