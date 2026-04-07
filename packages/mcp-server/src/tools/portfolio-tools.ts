/**
 * Portfolio Tools — Fleet-wide status and coordination tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const portfolioTools: Tool[] = [
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
  {
    name: 'get_portfolio_metrics',
    description:
      'Get aggregated cost, throughput, and flow efficiency metrics across all registered projects over a rolling window. Returns total cost, features completed, throughput per day, average cycle time, flow efficiency (value-add time / total elapsed), error budgets per project, and identifies the highest-cost and lowest-throughput projects (bottleneck signal). Use this to understand portfolio-level delivery economics and surface waste.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPaths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of project paths to include. When provided, overrides GlobalSettings.projects[] and scopes the report to only these paths.',
        },
        windowDays: {
          type: 'number',
          description: 'Rolling window in days for completed feature aggregation. Defaults to 7.',
        },
      },
    },
  },
];
