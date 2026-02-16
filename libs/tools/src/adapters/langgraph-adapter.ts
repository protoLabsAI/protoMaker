/**
 * LangGraph Adapter
 *
 * Adapts unified tools for use with LangGraph agent workflows
 * Maps tool functions to LangGraph tool definitions
 */

import type { ToolContext } from '../types.js';
import { listFeatures } from '../domains/features/list-features.js';
import { getFeature } from '../domains/features/get-feature.js';
import { createFeature } from '../domains/features/create-feature.js';
import { updateFeature } from '../domains/features/update-feature.js';
import { deleteFeature } from '../domains/features/delete-feature.js';

/**
 * LangGraph tool definition
 */
export interface LangGraphToolDefinition {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  func: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * LangGraph adapter for feature tools
 */
export class LangGraphFeatureAdapter {
  private context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  /**
   * Get all tool definitions for LangGraph
   */
  getToolDefinitions(): LangGraphToolDefinition[] {
    return [
      {
        name: 'list_features',
        description:
          'List all features for a project. Use compact=true to reduce response size.',
        schema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'in-progress', 'review', 'done', 'blocked', 'verified'],
              description: 'Optional filter by feature status',
            },
            compact: {
              type: 'boolean',
              description: 'Return compact feature format (default: false)',
            },
          },
          required: ['projectPath'],
        },
        func: async (args: Record<string, unknown>): Promise<string> => {
          const result = await listFeatures(this.context, {
            projectPath: args.projectPath as string,
            status: args.status as any,
            compact: (args.compact as boolean) ?? false,
          });
          return JSON.stringify(result);
        },
      },
      {
        name: 'get_feature',
        description: 'Get details for a specific feature by ID.',
        schema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            featureId: {
              type: 'string',
              description: 'The feature ID (UUID)',
            },
          },
          required: ['projectPath', 'featureId'],
        },
        func: async (args: Record<string, unknown>): Promise<string> => {
          const result = await getFeature(this.context, {
            projectPath: args.projectPath as string,
            featureId: args.featureId as string,
          });
          return JSON.stringify(result);
        },
      },
      {
        name: 'create_feature',
        description: 'Create a new feature on the Kanban board.',
        schema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            title: {
              type: 'string',
              description: 'Short title for the feature',
            },
            description: {
              type: 'string',
              description: 'Detailed description with requirements and acceptance criteria.',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'in-progress'],
              description: 'Initial status (default: backlog)',
            },
            branchName: {
              type: 'string',
              description: 'Optional git branch name',
            },
            dependencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of feature IDs that this feature depends on',
            },
            complexity: {
              type: 'string',
              enum: ['small', 'medium', 'large', 'architectural'],
              description: 'Feature complexity level',
            },
            assignee: {
              type: 'string',
              description: 'Who this feature is assigned to',
            },
          },
          required: ['projectPath', 'title', 'description'],
        },
        func: async (args: Record<string, unknown>): Promise<string> => {
          const result = await createFeature(this.context, {
            projectPath: args.projectPath as string,
            feature: {
              title: args.title as string,
              description: args.description as string,
              status: args.status as any,
              branchName: args.branchName as string | undefined,
              dependencies: args.dependencies as string[] | undefined,
              complexity: args.complexity as any,
              assignee: args.assignee as string | undefined,
            },
          });
          return JSON.stringify(result);
        },
      },
      {
        name: 'update_feature',
        description: "Update a feature's properties.",
        schema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            featureId: {
              type: 'string',
              description: 'The feature ID (UUID)',
            },
            title: {
              type: 'string',
              description: 'New title (optional)',
            },
            description: {
              type: 'string',
              description: 'New description (optional)',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'in-progress', 'review', 'done'],
              description: 'New status (optional)',
            },
            complexity: {
              type: 'string',
              enum: ['small', 'medium', 'large', 'architectural'],
              description: 'Feature complexity level',
            },
            assignee: {
              type: ['string', 'null'],
              description: 'Who this feature is assigned to',
            },
          },
          required: ['projectPath', 'featureId'],
        },
        func: async (args: Record<string, unknown>): Promise<string> => {
          const result = await updateFeature(this.context, {
            projectPath: args.projectPath as string,
            featureId: args.featureId as string,
            updates: {
              title: args.title as string | undefined,
              description: args.description as string | undefined,
              status: args.status as any,
              complexity: args.complexity as any,
              assignee: args.assignee as string | null | undefined,
            },
          });
          return JSON.stringify(result);
        },
      },
      {
        name: 'delete_feature',
        description: 'Delete a feature from the board.',
        schema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            featureId: {
              type: 'string',
              description: 'The feature ID (UUID)',
            },
          },
          required: ['projectPath', 'featureId'],
        },
        func: async (args: Record<string, unknown>): Promise<string> => {
          const result = await deleteFeature(this.context, {
            projectPath: args.projectPath as string,
            featureId: args.featureId as string,
          });
          return JSON.stringify(result);
        },
      },
    ];
  }
}
