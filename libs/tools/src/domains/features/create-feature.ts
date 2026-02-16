/**
 * Create Feature Tool
 *
 * Creates a new feature on the Kanban board
 */

import type {
  ToolContext,
  ToolResult,
  CreateFeatureInput,
  CreateFeatureOutput,
} from '../../types.js';

/**
 * Create a new feature
 */
export async function createFeature(
  context: ToolContext,
  input: CreateFeatureInput
): Promise<ToolResult<CreateFeatureOutput>> {
  try {
    const { projectPath, feature } = input;

    if (!projectPath || !feature) {
      return {
        success: false,
        error: 'projectPath and feature are required',
        errorCode: 'MISSING_REQUIRED_FIELDS',
      };
    }

    if (!context.featureLoader) {
      return {
        success: false,
        error: 'featureLoader not available in context',
        errorCode: 'MISSING_FEATURE_LOADER',
      };
    }

    // Check for duplicate title if title is provided
    if (feature.title && feature.title.trim()) {
      const duplicate = await context.featureLoader.findDuplicateTitle(projectPath, feature.title);
      if (duplicate) {
        return {
          success: false,
          error: `A feature with title "${feature.title}" already exists`,
          errorCode: 'DUPLICATE_TITLE',
          metadata: { duplicateFeatureId: duplicate.id },
        };
      }
    }

    const created = await context.featureLoader.create(projectPath, feature);

    // Emit feature_created event for hooks
    if (context.events) {
      context.events.emit('feature:created', {
        featureId: created.id,
        featureName: created.name,
        projectPath,
      });
    }

    return {
      success: true,
      data: { feature: created },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'CREATE_FEATURE_FAILED',
    };
  }
}
