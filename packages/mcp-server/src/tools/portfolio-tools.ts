/**
 * Portfolio Management Tools (Multi-Project Registry)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const portfolioTools: Tool[] = [
  {
    name: 'sync_registry',
    description:
      'Sync the portfolio registry with current project state. Updates project metadata, feature counts, and health status across all managed projects.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPaths: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Array of project paths to sync (optional, syncs all if not provided)',
        },
      },
    },
  },
  {
    name: 'get_portfolio_sitrep',
    description:
      'Get a sitrep across all portfolio projects. Returns aggregated health, active features, running agents, and cross-project dependencies.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
