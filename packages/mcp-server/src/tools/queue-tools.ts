/**
 * Queue Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const queueTools: Tool[] = [
  {
    name: 'queue_feature',
    description:
      'Add a feature to the agent queue for processing. Features in queue are automatically picked up.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to queue',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'list_queue',
    description: 'List all features currently in the agent queue.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'clear_queue',
    description:
      'Clear all features from the agent queue. This is a destructive action — requires sufficient trust tier. If trust is insufficient, an approval request is created instead.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Optional project path for trust tier enforcement',
        },
        requestingAgentId: {
          type: 'string',
          description:
            'Optional agent ID for trust tier enforcement. If the agent lacks sufficient trust, an approval request is created instead of executing.',
        },
      },
    },
  },
];
