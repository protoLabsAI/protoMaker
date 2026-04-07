/**
 * Portfolio Tools — Fleet-wide status and coordination tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const portfolioTools: Tool[] = [
  {
    name: 'sync_registry',
    description:
      'Reconcile settings.projects[] with the Workstacean project registry. ' +
      'Identifies registry projects missing from the UI project list (added), ' +
      'and settings entries no longer in the registry (orphaned). ' +
      'Set dryRun=false to apply changes automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description:
            'Absolute path to the Studio project directory. Used to locate the local ' +
            'registry snapshot (workspace/projects.yaml) when Workstacean is unreachable.',
        },
        dryRun: {
          type: 'boolean',
          description:
            'When true (default), reports what would change without applying it. ' +
            'Set to false to automatically add missing projects to settings.projects[].',
        },
      },
      required: ['projectPath'],
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
