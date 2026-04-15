/**
 * Board tools — DynamicStructuredTool wrappers for Automaker board operations.
 *
 * Factory: createBoardTools(featureLoader) returns LangGraph-compatible SharedTool
 * instances for list_features, update_feature, and create_feature.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing the concrete FeatureLoader
// ---------------------------------------------------------------------------

export interface BoardDeps {
  featureLoader: {
    getAll: (projectPath: string) => Promise<Feature[]>;
    get: (projectPath: string, featureId: string) => Promise<Feature | null>;
    create: (projectPath: string, feature: Partial<Feature>) => Promise<Feature>;
    update: (
      projectPath: string,
      featureId: string,
      updates: Partial<Feature>
    ) => Promise<Feature | null>;
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListFeaturesInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
  status: z
    .enum(['backlog', 'in_progress', 'review', 'blocked', 'done'])
    .optional()
    .describe('Filter features by status'),
});

const UpdateFeatureInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
  featureId: z.string().describe('The feature ID'),
  title: z.string().optional().describe('New title for the feature'),
  description: z.string().optional().describe('New description'),
  status: z
    .enum(['backlog', 'in_progress', 'review', 'blocked', 'done'])
    .optional()
    .describe('New status'),
  complexity: z
    .enum(['small', 'medium', 'large', 'architectural'])
    .optional()
    .describe('Complexity tier'),
  priority: z.number().int().min(0).max(4).optional().describe('Priority (0=none,1=urgent,4=low)'),
  workflow: z.string().optional().describe('Workflow name for pipeline control'),
});

const CreateFeatureInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
  title: z.string().describe('Feature title'),
  description: z.string().optional().describe('Feature description'),
  complexity: z
    .enum(['small', 'medium', 'large', 'architectural'])
    .optional()
    .default('medium')
    .describe('Complexity tier'),
  epicId: z.string().optional().describe('Parent epic ID if this feature belongs to an epic'),
  workflow: z
    .string()
    .optional()
    .describe(
      'Workflow name (standard, read-only, content, audit, research, tech-debt-scan, postmortem, dependency-health, cost-analysis, strategic-review, changelog-digest, swebench, or custom). Controls pipeline phases, processors, and execution settings.'
    ),
});

const FeatureOutputSchema = z.object({
  feature: z.record(z.string(), z.unknown()),
});

const FeatureListOutputSchema = z.object({
  features: z.array(z.record(z.string(), z.unknown())),
  count: z.number(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates board management tools bound to the provided featureLoader.
 *
 * @param deps - Board dependencies (featureLoader)
 * @returns Array of SharedTool instances for use with ToolRegistry or toLangGraphTools()
 */
export function createBoardTools(deps: BoardDeps): SharedTool[] {
  const listFeaturesTool = defineSharedTool({
    name: 'list_features',
    description:
      'List features on the Automaker board. Optionally filter by status ' +
      '(backlog, in_progress, review, blocked, done). Returns all features if no filter given.',
    inputSchema: ListFeaturesInputSchema,
    outputSchema: FeatureListOutputSchema,
    metadata: { category: 'board', tags: ['board', 'features', 'list'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ListFeaturesInputSchema>;
      try {
        let features = await deps.featureLoader.getAll(input.projectPath);
        if (input.status) {
          features = features.filter((f) => f.status === input.status);
        }
        return { success: true, data: { features: features as never[], count: features.length } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list features',
        };
      }
    },
  });

  const updateFeatureTool = defineSharedTool({
    name: 'update_feature',
    description:
      'Update a feature on the Automaker board. Can change status, title, description, ' +
      'complexity, or priority.',
    inputSchema: UpdateFeatureInputSchema,
    outputSchema: FeatureOutputSchema,
    metadata: { category: 'board', tags: ['board', 'features', 'update'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof UpdateFeatureInputSchema>;
      try {
        const { projectPath, featureId, ...updates } = input;
        const updated = await deps.featureLoader.update(
          projectPath,
          featureId,
          updates as Partial<Feature>
        );
        if (!updated) {
          return { success: false, error: `Feature '${featureId}' not found` };
        }
        return { success: true, data: { feature: updated as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update feature',
        };
      }
    },
  });

  const createFeatureTool = defineSharedTool({
    name: 'create_feature',
    description: 'Create a new feature on the Automaker board.',
    inputSchema: CreateFeatureInputSchema,
    outputSchema: FeatureOutputSchema,
    metadata: { category: 'board', tags: ['board', 'features', 'create'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof CreateFeatureInputSchema>;
      try {
        const { projectPath, ...fields } = input;
        const feature = await deps.featureLoader.create(projectPath, fields);
        return { success: true, data: { feature: feature as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create feature',
        };
      }
    },
  });

  return [listFeaturesTool, updateFeatureTool, createFeatureTool];
}

// ---------------------------------------------------------------------------
// manage_board — unified read/write action tool
// ---------------------------------------------------------------------------

const ManageBoardInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list').describe('List features with optional filters'),
    projectPath: z.string().describe('Absolute path to the project directory'),
    status: z
      .enum(['backlog', 'in_progress', 'review', 'blocked', 'done'])
      .optional()
      .describe('Filter by status'),
    priority: z.number().int().min(0).max(4).optional().describe('Filter by priority (0-4)'),
    limit: z.number().int().min(1).max(200).optional().describe('Max results to return'),
    offset: z.number().int().min(0).optional().describe('Number of results to skip (pagination)'),
  }),
  z.object({
    action: z.literal('get').describe('Get full metadata for a single feature'),
    projectPath: z.string().describe('Absolute path to the project directory'),
    featureId: z.string().describe('The feature ID to retrieve'),
  }),
  z.object({
    action: z.literal('search').describe('Search features by title or description'),
    projectPath: z.string().describe('Absolute path to the project directory'),
    query: z.string().describe('Text to search for in feature title and description'),
    limit: z.number().int().min(1).max(200).optional().describe('Max results to return'),
    offset: z.number().int().min(0).optional().describe('Number of results to skip (pagination)'),
  }),
]);

/**
 * Creates a manage_board tool that supports list, get, and search actions.
 *
 * @param deps - Board dependencies (featureLoader)
 * @returns A SharedTool instance for the manage_board tool
 */
export function createManageBoardTool(deps: BoardDeps): SharedTool {
  return defineSharedTool({
    name: 'manage_board',
    description:
      'Read features from the Automaker board. Supports three actions:\n' +
      '  • list — enumerate features with optional status/priority filters and pagination\n' +
      '  • get  — retrieve full metadata for a single feature by ID\n' +
      '  • search — search feature titles and descriptions by keyword',
    inputSchema: ManageBoardInputSchema,
    outputSchema: z.object({ result: z.unknown() }),
    metadata: { category: 'board', tags: ['board', 'features', 'read'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ManageBoardInputSchema>;
      try {
        if (input.action === 'get') {
          const feature = await deps.featureLoader.get(input.projectPath, input.featureId);
          if (!feature) {
            return { success: false, error: `Feature '${input.featureId}' not found` };
          }
          return { success: true, data: { result: feature } };
        }

        // list and search both start from getAll
        let features = await deps.featureLoader.getAll(input.projectPath);

        if (input.action === 'list') {
          if (input.status) {
            features = features.filter((f) => f.status === input.status);
          }
          if (input.priority !== undefined) {
            features = features.filter((f) => f.priority === input.priority);
          }
        } else {
          // search
          const q = input.query.toLowerCase();
          features = features.filter(
            (f) =>
              (f.title ?? '').toLowerCase().includes(q) ||
              (f.description ?? '').toLowerCase().includes(q)
          );
        }

        const total = features.length;
        const offset = (input as { offset?: number }).offset ?? 0;
        const limit = (input as { limit?: number }).limit ?? 50;
        const page = features.slice(offset, offset + limit);

        const summaries = page.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          priority: f.priority,
          complexity: f.complexity,
          statusChangeReason: f.statusChangeReason,
          dependencies: f.dependencies ?? [],
          updatedAt: f.updatedAt,
        }));

        return {
          success: true,
          data: {
            result: {
              features: summaries,
              total,
              offset,
              limit,
              hasMore: offset + limit < total,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'manage_board failed',
        };
      }
    },
  });
}
