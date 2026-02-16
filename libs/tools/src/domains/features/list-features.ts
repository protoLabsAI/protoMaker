/**
 * List Features Tool
 *
 * Lists all features for a project with optional filtering by status
 */

import type {
  ToolContext,
  ToolResult,
  ListFeaturesInput,
  ListFeaturesOutput,
  CompactFeature,
} from '../../types.js';
import type { Feature } from '@automaker/types';

/**
 * Convert full feature to compact representation
 */
function toCompactFeature(feature: Feature): CompactFeature {
  return {
    id: feature.id,
    title: feature.title,
    status: feature.status,
    complexity: feature.complexity,
    branchName: feature.branchName,
    costUsd: feature.costUsd,
    prNumber: feature.prNumber,
    prUrl: feature.prUrl,
    epicId: feature.epicId,
    isEpic: feature.isEpic,
    assignee: feature.assignee,
    dependencies: feature.dependencies,
    updatedAt: feature.updatedAt,
  };
}

/**
 * List all features for a project
 */
export async function listFeatures(
  context: ToolContext,
  input: ListFeaturesInput
): Promise<ToolResult<ListFeaturesOutput>> {
  try {
    const { projectPath, status, compact = false } = input;

    if (!projectPath) {
      return {
        success: false,
        error: 'projectPath is required',
        errorCode: 'MISSING_PROJECT_PATH',
      };
    }

    if (!context.featureLoader) {
      return {
        success: false,
        error: 'featureLoader not available in context',
        errorCode: 'MISSING_FEATURE_LOADER',
      };
    }

    let features = await context.featureLoader.getAll(projectPath);

    // Filter by status if provided
    if (status) {
      features = features.filter((f) => f.status === status);
    }

    // Return compact format if requested
    if (compact) {
      const compactFeatures = features.map(toCompactFeature);
      return {
        success: true,
        data: { features: compactFeatures },
      };
    }

    return {
      success: true,
      data: { features },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'LIST_FEATURES_FAILED',
    };
  }
}
