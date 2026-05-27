/**
 * Lead Engineer Tools (Feature Handoff and Orchestration)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const leadEngineerTools: Tool[] = [
  {
    name: 'start_lead_engineer',
    description:
      'Start the lead engineer agent to coordinate feature development. The lead engineer reviews PRs, manages dependencies, and orchestrates multiple feature agents.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        mode: {
          type: 'string',
          enum: ['review', 'orchestrate', 'both'],
          description:
            'Lead engineer mode: review (PR reviews only), orchestrate (dependency management), or both (default: both)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'stop_lead_engineer',
    description: 'Stop the lead engineer agent.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_lead_engineer_status',
    description: 'Get the current status of the lead engineer agent.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_feature_handoff',
    description:
      'Get the handoff state for a feature. Returns what the lead engineer has reviewed, approved, or flagged for changes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          minLength: 1,
          description: 'The feature ID to get handoff status for',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
];
