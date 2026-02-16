/**
 * MCP Adapter
 *
 * Adapts unified tools for use with MCP (Model Context Protocol)
 * Maps tool functions to MCP tool schemas and handlers
 */

import type { ToolContext, ToolResult } from '../types.js';
import { listFeatures } from '../domains/features/list-features.js';
import { getFeature } from '../domains/features/get-feature.js';
import { createFeature } from '../domains/features/create-feature.js';
import { updateFeature } from '../domains/features/update-feature.js';
import { deleteFeature } from '../domains/features/delete-feature.js';

/**
 * MCP tool definition
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tool handler function
 */
export type McpToolHandler = (
  context: ToolContext,
  args: Record<string, unknown>
) => Promise<ToolResult>;

/**
 * MCP adapter for feature tools
 */
export class McpFeatureAdapter {
  private context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  /**
   * Get all tool definitions
   */
  getToolDefinitions(): McpToolDefinition[] {
    return [
      {
        name: 'list_features',
        description:
          'List all features for a project. Use compact=true to reduce response size for MCP context.',
        inputSchema: {
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
              description:
                'Return compact feature format to reduce response size (default: false)',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'get_feature',
        description: 'Get details for a specific feature by ID.',
        inputSchema: {
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
      },
      {
        name: 'create_feature',
        description:
          'Create a new feature on the Kanban board. Features start in the backlog by default.',
        inputSchema: {
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
              description:
                'Detailed description with requirements and acceptance criteria. Be specific about file locations, components, and expected behavior.',
            },
            status: {
              type: 'string',
              enum: ['backlog', 'in-progress'],
              default: 'backlog',
              description: "Initial status. Use 'in-progress' to immediately start an agent.",
            },
            branchName: {
              type: 'string',
              description:
                'Optional git branch name for this feature. If not provided, auto-generated from title.',
            },
            dependencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of feature IDs that this feature depends on.',
            },
            complexity: {
              type: 'string',
              enum: ['small', 'medium', 'large', 'architectural'],
              description:
                'Feature complexity level for model selection. small=haiku, medium/large=sonnet, architectural=opus.',
            },
            assignee: {
              type: 'string',
              description:
                "Who this feature is assigned to. If set to a human name, auto-mode will skip this feature.",
            },
          },
          required: ['projectPath', 'title', 'description'],
        },
      },
      {
        name: 'update_feature',
        description:
          "Update a feature's properties. Can be used to change status, title, description, or move between columns.",
        inputSchema: {
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
              description: "New status (optional). Moving to 'in-progress' starts an agent.",
            },
            complexity: {
              type: 'string',
              enum: ['small', 'medium', 'large', 'architectural'],
              description: 'Feature complexity level for model selection.',
            },
            assignee: {
              type: ['string', 'null'],
              description: 'Who this feature is assigned to. Pass null to unassign.',
            },
          },
          required: ['projectPath', 'featureId'],
        },
      },
      {
        name: 'delete_feature',
        description: 'Delete a feature from the board.',
        inputSchema: {
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
      },
    ];
  }

  /**
   * Handle a tool call
   */
  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'list_features':
        return listFeatures(this.context, {
          projectPath: args.projectPath as string,
          status: args.status as any,
          compact: (args.compact as boolean) ?? false,
        });

      case 'get_feature':
        return getFeature(this.context, {
          projectPath: args.projectPath as string,
          featureId: args.featureId as string,
        });

      case 'create_feature':
        return createFeature(this.context, {
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

      case 'update_feature':
        return updateFeature(this.context, {
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

      case 'delete_feature':
        return deleteFeature(this.context, {
          projectPath: args.projectPath as string,
          featureId: args.featureId as string,
        });

      default:
        return {
          success: false,
          error: `Unknown tool: ${name}`,
          errorCode: 'UNKNOWN_TOOL',
        };
    }
  }
}
