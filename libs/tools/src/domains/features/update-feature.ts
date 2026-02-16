/**
 * Update Feature Tool
 *
 * Updates a feature's properties
 */

import type {
  ToolContext,
  ToolResult,
  UpdateFeatureInput,
  UpdateFeatureOutput,
} from '../../types.js';

/**
 * Update a feature
 */
export async function updateFeature(
  context: ToolContext,
  input: UpdateFeatureInput
): Promise<ToolResult<UpdateFeatureOutput>> {
  try {
    const { projectPath, featureId, updates } = input;

    if (!projectPath || !featureId || !updates) {
      return {
        success: false,
        error: 'projectPath, featureId, and updates are required',
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

    // Check for duplicate title if title is being updated
    if (updates.title && updates.title.trim()) {
      const duplicate = await context.featureLoader.findDuplicateTitle(
        projectPath,
        updates.title,
        featureId // Exclude the current feature from duplicate check
      );
      if (duplicate) {
        return {
          success: false,
          error: `A feature with title "${updates.title}" already exists`,
          errorCode: 'DUPLICATE_TITLE',
          metadata: { duplicateFeatureId: duplicate.id },
        };
      }
    }

    const updated = await context.featureLoader.update(projectPath, featureId, updates);

    if (!updated) {
      return {
        success: false,
        error: 'Feature not found',
        errorCode: 'FEATURE_NOT_FOUND',
      };
    }

    return {
      success: true,
      data: { feature: updated },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'UPDATE_FEATURE_FAILED',
    };
  }
}
