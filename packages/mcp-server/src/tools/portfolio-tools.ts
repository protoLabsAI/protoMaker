/**
 * Portfolio Tools — Fleet-wide status and coordination tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const portfolioTools: Tool[] = [
  {
    name: 'sync_registry',
    description:
      'Compare Studio settings.projects[] against the Workstacean project registry. Reports missing projects (in Workstacean but not in settings), orphaned projects (in settings but not in Workstacean), and metadata mismatches. Runs as a dry run by default — set dryRun: false to apply the sync and add missing projects to settings.',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: {
          type: 'boolean',
          description:
            'When true (default), only reports the diff without making any changes. Set to false to apply the sync: adds missing projects to settings and flags orphaned ones.',
          default: true,
        },
      },
    },
  },
  {
    name: 'get_portfolio_sitrep',
    description:
      'Get a fleet-wide portfolio status report aggregating all active projects in one call. Returns per-project health (green/yellow/red), active agents, backlog depth, blocked count, and staging lag. Also includes portfolio-level metrics (total active agents, WIP utilization, top constraint) and pending human decisions (PR reviews, escalations, prioritization needs) across all projects. Use this instead of calling get_sitrep for each project individually.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPaths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of project paths to include. When provided, overrides GlobalSettings.projects[] and scopes the report to only these paths. Pass an empty array to return empty results without fetching any projects.',
        },
      },
    },
  },
];
