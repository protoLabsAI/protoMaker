/**
 * Feature Orchestration and Dependency Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const orchestrationTools: Tool[] = [
  {
    name: 'set_feature_dependencies',
    description:
      'Set dependencies for a feature. The feature will not start until all dependencies are marked Done.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to set dependencies for',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of feature IDs that this feature depends on',
        },
      },
      required: ['projectPath', 'featureId', 'dependencies'],
    },
  },
  {
    name: 'get_dependency_graph',
    description:
      'Get the dependency graph for all features in a project. Shows which features block others.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'start_auto_mode',
    description:
      'Start auto-mode for a project. Agents will automatically pick up and process backlog features respecting dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum number of features to process concurrently (default: 1)',
          default: 1,
        },
        branchName: {
          type: 'string',
          description: 'Optional branch/worktree name to run auto-mode on',
        },
        forceStart: {
          type: 'boolean',
          description:
            'Bypass data integrity check. Use when feature count dropped intentionally (e.g., cleanup).',
          default: false,
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'stop_auto_mode',
    description: 'Stop auto-mode for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        branchName: {
          type: 'string',
          description: 'Optional branch/worktree name',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_auto_mode_status',
    description: 'Check if auto-mode is running for a project and get its status.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_execution_order',
    description:
      'Get the resolved execution order for features based on dependencies. Useful for planning.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'all'],
          default: 'backlog',
          description: 'Which features to include in the execution order',
        },
      },
      required: ['projectPath'],
    },
  },
];
