/**
 * Lead Engineer Tools
 *
 * MCP tools for managing the Lead Engineer and accessing phase handoff documents.
 * - start_lead_engineer: Start LE for a project
 * - stop_lead_engineer: Stop LE for a project
 * - get_lead_engineer_status: Get LE status, world state, metrics
 * - get_feature_handoff: Retrieve the latest handoff document for a feature
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const leadEngineerTools: Tool[] = [
  {
    name: 'start_lead_engineer',
    description:
      'Start the Lead Engineer to manage a project through the production phase. Orchestrates auto-mode, reacts to events with fast-path rules, and wraps up with retro + improvement tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'Project slug',
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum number of features to process concurrently (default: 1)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'stop_lead_engineer',
    description: 'Stop the Lead Engineer from managing a project.',
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
    name: 'get_lead_engineer_status',
    description:
      'Get Lead Engineer status including world state, flow state, rule execution log, and metrics.',
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
    name: 'get_feature_handoff',
    description:
      'Get the latest Lead Engineer phase handoff document for a feature. ' +
      'Handoff documents summarise what was done in each lifecycle phase (INTAKE, PLAN, EXECUTE, ' +
      'REVIEW, MERGE, DEPLOY) including discoveries, modified files, outstanding questions, ' +
      'scope limits, test coverage, and a verdict (APPROVE | WARN | BLOCK).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to retrieve the handoff for',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
];
