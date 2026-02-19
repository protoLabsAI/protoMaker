/**
 * Get Feature Dependencies Tool
 *
 * Returns the dependency chain for a feature: what it depends on,
 * what depends on it, and whether all dependencies are satisfied.
 */

import type { ToolContext, ToolResult } from '../../types.js';

export interface GetDependenciesInput {
  projectPath: string;
  featureId: string;
}

export interface DependencyInfo {
  id: string;
  title?: string;
  status?: string;
  satisfied: boolean;
}

export interface GetDependenciesOutput {
  featureId: string;
  featureTitle?: string;
  /** Features this feature depends on (must complete before this one starts) */
  dependsOn: DependencyInfo[];
  /** Features that depend on this feature (blocked until this one completes) */
  blockedBy: DependencyInfo[];
  /** Whether all dependencies are satisfied */
  allSatisfied: boolean;
  /** Statuses that count as "satisfied" */
  satisfiedStatuses: string[];
}

const SATISFIED_STATUSES = ['done', 'completed', 'verified', 'review'];

export async function getDependencies(
  context: ToolContext,
  input: GetDependenciesInput
): Promise<ToolResult<GetDependenciesOutput>> {
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

    const allFeatures = await context.featureLoader.getAll(projectPath);
    const featureMap = new Map(allFeatures.map((f) => [f.id, f]));

    // What this feature depends on
    const dependsOn: DependencyInfo[] = (feature.dependencies || []).map((depId) => {
      const dep = featureMap.get(depId);
      return {
        id: depId,
        title: dep?.title,
        status: dep?.status,
        satisfied: dep?.status ? SATISFIED_STATUSES.includes(dep.status) : false,
      };
    });

    // What depends on this feature (reverse lookup)
    const blockedBy: DependencyInfo[] = allFeatures
      .filter((f) => f.dependencies?.includes(featureId))
      .map((f) => ({
        id: f.id,
        title: f.title,
        status: f.status,
        satisfied: f.status ? SATISFIED_STATUSES.includes(f.status) : false,
      }));

    const allSatisfied = dependsOn.length === 0 || dependsOn.every((d) => d.satisfied);

    return {
      success: true,
      data: {
        featureId,
        featureTitle: feature.title,
        dependsOn,
        blockedBy,
        allSatisfied,
        satisfiedStatuses: SATISFIED_STATUSES,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'GET_DEPENDENCIES_FAILED',
    };
  }
}
