/**
 * Cross-Repository Dependency Tools (Fleet-Wide)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const crossRepoTools: Tool[] = [
  {
    name: 'flag_cross_repo_dependency',
    description:
      'Flag a cross-repository dependency. Creates a dependency record with status "pending".',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        dependencyProjectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the dependent project',
        },
        dependencyType: {
          type: 'string',
          enum: ['library', 'service', 'config', 'data'],
          description: 'Type of dependency',
        },
        description: {
          type: 'string',
          minLength: 1,
          description: 'Description of the dependency',
        },
        isBlocking: {
          type: 'boolean',
          description: 'Whether this dependency blocks current work (default: false)',
        },
      },
      required: ['projectPath', 'dependencyProjectPath', 'dependencyType', 'description'],
    },
  },
  {
    name: 'resolve_cross_repo_dependency',
    description:
      'Mark a cross-repository dependency as resolved. Updates status to "resolved" with a resolution note.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        dependencyProjectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the dependent project',
        },
        resolutionNote: {
          type: 'string',
          minLength: 1,
          description: 'Description of how the dependency was resolved',
        },
      },
      required: ['projectPath', 'dependencyProjectPath', 'resolutionNote'],
    },
  },
];
