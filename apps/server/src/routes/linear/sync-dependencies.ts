/**
 * Sync Dependencies Endpoint
 *
 * POST /api/linear/sync-dependencies
 *
 * One-time endpoint to sync existing Automaker feature dependencies
 * to Linear issue relations. Creates "blocks" relations in Linear
 * based on feature dependency graph.
 *
 * Request body:
 * {
 *   projectPath: string;
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   summary: {
 *     total: number;
 *     created: number;
 *     skipped: number;
 *     errors: number;
 *   };
 *   details: Array<{
 *     featureId: string;
 *     dependencyId: string;
 *     status: 'created' | 'skipped' | 'error';
 *     reason?: string;
 *   }>;
 * }
 */

import type { RequestHandler } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { LinearMCPClient } from '../../services/linear-mcp-client.js';
import type { SettingsService } from '../../services/settings-service.js';

const logger = createLogger('SyncDependencies');

interface SyncDependenciesRequest {
  projectPath: string;
}

interface DependencyResult {
  featureId: string;
  featureTitle?: string;
  dependencyId: string;
  dependencyTitle?: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
}

interface SyncDependenciesResponse {
  success: boolean;
  summary: {
    total: number;
    created: number;
    skipped: number;
    errors: number;
  };
  details: DependencyResult[];
}

/**
 * Create sync dependencies handler
 *
 * @param settingsService - Settings service for OAuth token retrieval
 * @param featureLoader - Feature loader for retrieving features
 * @returns Express request handler
 */
export function createSyncDependenciesHandler(
  settingsService: SettingsService,
  featureLoader: FeatureLoader
): RequestHandler {
  return async (req, res) => {
    const { projectPath } = req.body as SyncDependenciesRequest;

    if (!projectPath) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: projectPath',
      });
      return;
    }

    logger.info(`Starting dependency sync for project: ${projectPath}`);

    try {
      // Get all features
      const features = await featureLoader.getAll(projectPath);
      logger.info(`Found ${features.length} features`);

      // Initialize Linear client
      const linearClient = new LinearMCPClient(settingsService, projectPath);

      // Build list of dependency relationships to sync
      const dependencyRelations: Array<{
        featureId: string;
        featureTitle?: string;
        dependencyId: string;
        dependencyTitle?: string;
        featureLinearId?: string;
        dependencyLinearId?: string;
      }> = [];

      for (const feature of features) {
        if (!feature.dependencies || feature.dependencies.length === 0) {
          continue;
        }

        for (const depId of feature.dependencies) {
          const depFeature = features.find((f) => f.id === depId);
          dependencyRelations.push({
            featureId: feature.id,
            featureTitle: feature.title,
            dependencyId: depId,
            dependencyTitle: depFeature?.title,
            featureLinearId: feature.linearIssueId,
            dependencyLinearId: depFeature?.linearIssueId,
          });
        }
      }

      logger.info(`Found ${dependencyRelations.length} dependency relationships`);

      // Process each dependency relationship
      const details: DependencyResult[] = [];

      for (const relation of dependencyRelations) {
        const result: DependencyResult = {
          featureId: relation.featureId,
          featureTitle: relation.featureTitle,
          dependencyId: relation.dependencyId,
          dependencyTitle: relation.dependencyTitle,
          status: 'skipped',
        };

        // Skip if either feature doesn't have a Linear issue ID
        if (!relation.featureLinearId) {
          result.status = 'skipped';
          result.reason = `Feature ${relation.featureId} not synced to Linear`;
          details.push(result);
          continue;
        }

        if (!relation.dependencyLinearId) {
          result.status = 'skipped';
          result.reason = `Dependency ${relation.dependencyId} not synced to Linear`;
          details.push(result);
          continue;
        }

        try {
          // Create "blocks" relation in Linear
          // The dependency blocks the feature (dependency → blocks → feature)
          await linearClient.createIssueRelation({
            issueId: relation.dependencyLinearId,
            relatedIssueId: relation.featureLinearId,
            type: 'blocks',
          });

          result.status = 'created';
          result.reason = `Created blocks relation: ${relation.dependencyTitle || relation.dependencyId} blocks ${relation.featureTitle}`;
          logger.info(result.reason);
        } catch (error) {
          result.status = 'error';
          result.reason =
            error instanceof Error ? error.message : 'Unknown error creating relation';
          logger.error(
            `Failed to create relation for ${relation.featureId} -> ${relation.dependencyId}:`,
            error
          );
        }

        details.push(result);
      }

      // Calculate summary
      const summary = {
        total: dependencyRelations.length,
        created: details.filter((d) => d.status === 'created').length,
        skipped: details.filter((d) => d.status === 'skipped').length,
        errors: details.filter((d) => d.status === 'error').length,
      };

      logger.info('Dependency sync completed', summary);

      const response: SyncDependenciesResponse = {
        success: true,
        summary,
        details,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error syncing dependencies:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error syncing dependencies',
      });
    }
  };
}
