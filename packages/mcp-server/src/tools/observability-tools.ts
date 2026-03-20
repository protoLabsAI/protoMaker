/**
 * Observability, Metrics, and Langfuse Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const observabilityTools: Tool[] = [
  {
    name: 'get_settings',
    description:
      'Get global Automaker settings including theme, log level, auto-mode config, and project profiles.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_settings',
    description: 'Update global Automaker settings. Pass only the fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        settings: {
          type: 'object',
          description: 'Partial settings object with fields to update',
        },
      },
      required: ['settings'],
    },
  },
  {
    name: 'get_project_metrics',
    description:
      'Get aggregated project metrics including cycle time, cost, throughput, success rate, and token usage.',
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
    name: 'get_capacity_metrics',
    description:
      'Get capacity utilization metrics including concurrency, backlog size, and estimated backlog clearance time.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum concurrent features for utilization calculation (default: 3)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_forecast',
    description:
      'Estimate duration and cost for a new feature based on historical averages scaled by complexity.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description: 'Feature complexity level for forecast scaling (default: medium)',
        },
      },
      required: ['projectPath'],
    },
  },
];
