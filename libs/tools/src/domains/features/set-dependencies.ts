/**
 * Set Feature Dependencies Tool
 *
 * Sets dependencies for a feature with circular dependency detection.
 * Emits feature:dependencies-changed event when dependencies are updated.
 */

import type { ToolContext, ToolResult } from '../../types.js';
import type { Feature } from '@automaker/types';

export interface SetDependenciesInput {
  projectPath: string;
  featureId: string;
  dependencies: string[];
}

export interface SetDependenciesOutput {
  featureId: string;
  featureTitle?: string;
  dependencies: string[];
  previousDependencies: string[];
}

/**
 * Detect circular dependencies using DFS.
 * Returns the cycle path if found, null otherwise.
 */
function detectCircularDependency(
  featureId: string,
  newDeps: string[],
  featureMap: Map<string, Feature>
): string[] | null {
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(currentId: string): string[] | null {
    if (currentId === featureId && path.length > 0) {
      return [...path, currentId];
    }
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    path.push(currentId);

    // For the target feature, use the proposed new deps
    const deps =
      currentId === featureId ? newDeps : (featureMap.get(currentId)?.dependencies ?? []);

    for (const depId of deps) {
      const cycle = dfs(depId);
      if (cycle) return cycle;
    }

    path.pop();
    return null;
  }

  // Start DFS from each new dependency
  for (const depId of newDeps) {
    visited.clear();
    path.length = 0;
    const cycle = dfs(depId);
    if (cycle) return cycle;
  }

  return null;
}

export async function setDependencies(
  context: ToolContext,
  input: SetDependenciesInput
): Promise<ToolResult<SetDependenciesOutput>> {
  try {
    const { projectPath, featureId, dependencies } = input;

    if (!projectPath || !featureId) {
      return {
        success: false,
        error: 'projectPath and featureId are required',
        errorCode: 'MISSING_REQUIRED_FIELDS',
      };
    }

    if (!Array.isArray(dependencies)) {
      return {
        success: false,
        error: 'dependencies must be an array of feature IDs',
        errorCode: 'INVALID_DEPENDENCIES',
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

    // Self-dependency check
    if (dependencies.includes(featureId)) {
      return {
        success: false,
        error: 'A feature cannot depend on itself',
        errorCode: 'SELF_DEPENDENCY',
      };
    }

    // Validate all dependency IDs exist
    const allFeatures = await context.featureLoader.getAll(projectPath);
    const featureMap = new Map(allFeatures.map((f) => [f.id, f]));
    const missing = dependencies.filter((id) => !featureMap.has(id));
    if (missing.length > 0) {
      return {
        success: false,
        error: `Dependencies not found: ${missing.join(', ')}`,
        errorCode: 'DEPENDENCIES_NOT_FOUND',
        metadata: { missingIds: missing },
      };
    }

    // Circular dependency detection
    const cycle = detectCircularDependency(featureId, dependencies, featureMap);
    if (cycle) {
      return {
        success: false,
        error: `Circular dependency detected: ${cycle.join(' → ')}`,
        errorCode: 'CIRCULAR_DEPENDENCY',
        metadata: { cycle },
      };
    }

    const previousDependencies = feature.dependencies ?? [];

    // Update the feature
    const updated = await context.featureLoader.update(projectPath, featureId, { dependencies });
    if (!updated) {
      return {
        success: false,
        error: 'Failed to update feature',
        errorCode: 'UPDATE_FAILED',
      };
    }

    // Emit event
    if (context.events) {
      context.events.emit('feature:dependencies-changed', {
        projectPath,
        featureId,
        dependencies,
        previousDependencies,
      });
    }

    return {
      success: true,
      data: {
        featureId,
        featureTitle: feature.title,
        dependencies,
        previousDependencies,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'SET_DEPENDENCIES_FAILED',
    };
  }
}
