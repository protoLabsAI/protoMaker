/**
 * Lead Engineer Tools
 *
 * MCP tools for interacting with Lead Engineer phase handoff documents.
 * - get_feature_handoff: Retrieve the latest handoff document for a feature
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const leadEngineerTools: Tool[] = [
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
