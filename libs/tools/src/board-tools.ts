/**
 * Board tools — DynamicStructuredTool wrappers for Automaker board operations.
 *
 * Factory: createBoardTools(featureLoader) returns LangGraph-compatible SharedTool
 * instances for list_features, update_feature, and create_feature.
 */

// =============================================================================
// TOOL AUDIT: Gap analysis and migration checklist
// =============================================================================
//
// This audit maps every tool in libs/tools/src and classifies its current state.
// Tools that use defineSharedTool() with Zod inputSchema/outputSchema are
// MCP-adapter-compatible and type-safe. Raw async functions with TypeScript
// interfaces only CANNOT be passed to toMCPTool() or toLangGraphTool() and
// must be migrated.
//
// -----------------------------------------------------------------------------
// TOOLS WITH ZOD DEFINITIONS (adapter-compatible, no action needed)
// -----------------------------------------------------------------------------
//
// Factory family          | Tool name                | File
// ------------------------|--------------------------|-------------------------------
// createBoardTools        | list_features            | board-tools.ts
// createBoardTools        | update_feature           | board-tools.ts
// createBoardTools        | create_feature           | board-tools.ts
// createDiscordTools      | discord_send_message     | discord-tools.ts
// createDiscordTools      | discord_read_channel     | discord-tools.ts
// createGitHubTools       | github_list_prs          | github-tools.ts
// createGitHubTools       | github_merge_pr          | github-tools.ts
// createGitHubTools       | github_check_pr_status   | github-tools.ts
// createClaudeCodeTool    | claude-code              | claude-code-tool.ts
// createProjectTools      | project_list             | project-tools.ts
// createProjectTools      | project_get              | project-tools.ts
// createProjectTools      | project_update           | project-tools.ts
// createProjectTools      | project_add_link         | project-tools.ts
// createProjectTools      | project_remove_link      | project-tools.ts
// createProjectTools      | project_add_update       | project-tools.ts
// createProjectTools      | project_remove_update    | project-tools.ts
// createProjectTools      | project_list_docs        | project-tools.ts
// createProjectTools      | project_get_doc          | project-tools.ts
// createProjectTools      | project_create_doc       | project-tools.ts
// createProjectTools      | project_update_doc       | project-tools.ts
// createProjectTools      | project_delete_doc       | project-tools.ts
// createProjectTools      | project_list_features    | project-tools.ts
// (singleton)             | request_user_input       | domains/hitl/request-user-input.ts
//
// -----------------------------------------------------------------------------
// TOOLS NEEDING ZOD DEFINITIONS (migration checklist)
// -----------------------------------------------------------------------------
//
// These tools in domains/features/ are plain async functions with TypeScript
// interfaces only. They have no inputSchema/outputSchema Zod fields, so they
// cannot be registered as SharedTool instances or adapted for MCP/LangGraph.
//
// Each migration task requires:
//   1. Add a Zod inputSchema constant (replace the TS interface)
//   2. Add a Zod outputSchema constant (replace the TS interface)
//   3. Wrap the function body in defineSharedTool() following board-tools.ts pattern
//   4. Export the resulting SharedTool (not the raw function)
//   5. Update domains/features/index.ts to export the SharedTool instance
//
// [ ] domains/features/list-features.ts — listFeatures(context, input)
//       Input:  ListFeaturesInput  { projectPath, status?, compact? }
//       Output: ListFeaturesOutput { features: Feature[] | CompactFeature[] }
//       Note:   context.featureLoader is required; must stay context-injected
//
// [ ] domains/features/get-feature.ts — getFeature(context, input)
//       Input:  GetFeatureInput  { projectPath, featureId }
//       Output: GetFeatureOutput { feature: Feature }
//
// [ ] domains/features/create-feature.ts — createFeature(context, input)
//       Input:  CreateFeatureInput  { projectPath, feature: Partial<Feature> }
//       Output: CreateFeatureOutput { feature: Feature }
//       Note:   emits feature:created event via context.events
//
// [ ] domains/features/update-feature.ts — updateFeature(context, input)
//       Input:  UpdateFeatureInput  { projectPath, featureId, updates: Partial<Feature> }
//       Output: UpdateFeatureOutput { feature: Feature }
//
// [ ] domains/features/delete-feature.ts — deleteFeature(context, input)
//       Input:  DeleteFeatureInput  { projectPath, featureId }
//       Output: DeleteFeatureOutput { success: boolean }
//
// [ ] domains/features/query-board.ts — queryBoard(context, input)
//       Input:  QueryBoardInput  { projectPath, status?, epicId?, complexity?,
//                                  isEpic?, isBlocked?, hasDependencies?,
//                                  updatedAfter?, updatedBefore?, search?, limit? }
//       Output: QueryBoardOutput { features: CompactFeature[], total, filters }
//       Note:   inline TS interfaces — must be migrated to Zod alongside the function
//
// [ ] domains/features/get-dependencies.ts — getDependencies(context, input)
//       Input:  GetDependenciesInput  { projectPath, featureId }
//       Output: GetDependenciesOutput { featureId, featureTitle?, dependsOn[],
//                                       blockedBy[], allSatisfied, satisfiedStatuses[] }
//       Note:   inline TS interfaces — must be migrated to Zod alongside the function
//
// [ ] domains/features/set-dependencies.ts — setDependencies(context, input)
//       Input:  SetDependenciesInput  { projectPath, featureId, dependencies: string[] }
//       Output: SetDependenciesOutput { featureId, featureTitle?, dependencies[],
//                                       previousDependencies[] }
//       Note:   inline TS interfaces — must be migrated to Zod alongside the function
//
// =============================================================================

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
