/**
 * Delete Feature Tool
 *
 * Deletes a feature from the board
 */

import type {
  ToolContext,
  ToolResult,
  DeleteFeatureInput,
  DeleteFeatureOutput,
} from '../../types.js';

/**
 * Delete a feature
 */
export async function deleteFeature(
  context: ToolContext,
  input: DeleteFeatureInput
): Promise<ToolResult<DeleteFeatureOutput>> {
  try {
    const { projectPath, featureId } = input;

    if (!projectPath || !featureId) {
      return {
        success: false,
        error: 'projectPath and featureId are required',
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

    const success = await context.featureLoader.delete(projectPath, featureId);

    return {
      success,
      data: { success },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'DELETE_FEATURE_FAILED',
    };
  }
}
