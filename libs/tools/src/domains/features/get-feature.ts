/**
 * Get Feature Tool
 *
 * Retrieves a single feature by ID
 */

import type { ToolContext, ToolResult, GetFeatureInput, GetFeatureOutput } from '../../types.js';

/**
 * Get a single feature by ID
 */
export async function getFeature(
  context: ToolContext,
  input: GetFeatureInput
): Promise<ToolResult<GetFeatureOutput>> {
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

    const feature = await context.featureLoader.get(projectPath, featureId);

    if (!feature) {
      return {
        success: false,
        error: 'Feature not found',
        errorCode: 'FEATURE_NOT_FOUND',
      };
    }

    return {
      success: true,
      data: { feature },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'GET_FEATURE_FAILED',
    };
  }
}
