/**
 * Query Board Tool
 *
 * Advanced board query with compound filters: status, epic, assignee,
 * complexity, blocked status, date range. Returns compact results
 * to minimize agent context usage.
 */

import type { ToolContext, ToolResult, CompactFeature } from '../../types.js';
import type { Feature, FeatureStatus } from '@automaker/types';

export interface QueryBoardInput {
  projectPath: string;
  status?: FeatureStatus | FeatureStatus[];
  epicId?: string;
  assignee?: string | null;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  isEpic?: boolean;
  isBlocked?: boolean;
  hasDependencies?: boolean;
  updatedAfter?: number;
  updatedBefore?: number;
  search?: string;
  limit?: number;
}

export interface QueryBoardOutput {
  features: CompactFeature[];
  total: number;
  filters: Record<string, unknown>;
}

function toCompact(feature: Feature): CompactFeature {
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

export async function queryBoard(
  context: ToolContext,
  input: QueryBoardInput
): Promise<ToolResult<QueryBoardOutput>> {
  try {
    const { projectPath, limit = 50, ...filters } = input;

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
    const appliedFilters: Record<string, unknown> = {};

    // Status filter (single or array)
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      features = features.filter((f) => statuses.includes(f.status as FeatureStatus));
      appliedFilters.status = statuses;
    }

    // Epic filter
    if (filters.epicId !== undefined) {
      features = features.filter((f) => f.epicId === filters.epicId);
      appliedFilters.epicId = filters.epicId;
    }

    // Assignee filter (null means unassigned)
    if (filters.assignee !== undefined) {
      if (filters.assignee === null) {
        features = features.filter((f) => !f.assignee);
      } else {
        features = features.filter((f) => f.assignee === filters.assignee);
      }
      appliedFilters.assignee = filters.assignee;
    }

    // Complexity filter
    if (filters.complexity) {
      features = features.filter((f) => f.complexity === filters.complexity);
      appliedFilters.complexity = filters.complexity;
    }

    // Epic-only filter
    if (filters.isEpic !== undefined) {
      features = features.filter((f) => !!f.isEpic === filters.isEpic);
      appliedFilters.isEpic = filters.isEpic;
    }

    // Blocked filter
    if (filters.isBlocked !== undefined) {
      if (filters.isBlocked) {
        features = features.filter((f) => f.status === 'blocked');
      } else {
        features = features.filter((f) => f.status !== 'blocked');
      }
      appliedFilters.isBlocked = filters.isBlocked;
    }

    // Has dependencies filter
    if (filters.hasDependencies !== undefined) {
      if (filters.hasDependencies) {
        features = features.filter((f) => f.dependencies && f.dependencies.length > 0);
      } else {
        features = features.filter((f) => !f.dependencies || f.dependencies.length === 0);
      }
      appliedFilters.hasDependencies = filters.hasDependencies;
    }

    // Date range filters
    if (filters.updatedAfter) {
      features = features.filter((f) => {
        const updatedAt = typeof f.updatedAt === 'number' ? f.updatedAt : 0;
        return updatedAt >= filters.updatedAfter!;
      });
      appliedFilters.updatedAfter = filters.updatedAfter;
    }

    if (filters.updatedBefore) {
      features = features.filter((f) => {
        const updatedAt = typeof f.updatedAt === 'number' ? f.updatedAt : 0;
        return updatedAt <= filters.updatedBefore!;
      });
      appliedFilters.updatedBefore = filters.updatedBefore;
    }

    // Text search (title + description)
    if (filters.search) {
      const lower = filters.search.toLowerCase();
      features = features.filter(
        (f) =>
          f.title?.toLowerCase().includes(lower) || f.description?.toLowerCase().includes(lower)
      );
      appliedFilters.search = filters.search;
    }

    const total = features.length;
    const limited = features.slice(0, limit);

    return {
      success: true,
      data: {
        features: limited.map(toCompact),
        total,
        filters: appliedFilters,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'QUERY_BOARD_FAILED',
    };
  }
}
