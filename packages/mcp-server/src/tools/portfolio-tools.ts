/**
 * Portfolio Tools — Fleet-wide status, coordination, and cross-repository dependency tools
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
    name: 'get_cross_repo_dependencies',
    description:
      'Scan all features across all registered apps for cross-repo external dependencies. Returns a dependency graph with nodes (repos), edges (dependency relationships with status), critical path (longest dependency chain), and circular dependency risks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory to scan',
        },
        includeAllStatuses: {
          type: 'boolean',
          description:
            'When true, include satisfied dependencies in the graph. Default false (pending/broken only).',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'flag_cross_repo_dependency',
    description:
      'Record a cross-repo interface change and optionally auto-create follow-up features in affected repos. Emits a dependency:interface_changed bus event. Use this when a PR introduces breaking changes to exported TypeScript types, REST endpoints, or CLI interfaces.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the source project directory',
        },
        sourceRepo: {
          type: 'string',
          description: 'Name or path of the repo that introduced the breaking change',
        },
        mergedPrId: {
          type: 'string',
          description: 'PR ID or number that merged the breaking change',
        },
        changedInterfaces: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of changed interface/type/function/endpoint names (e.g. ["UserProfile", "GET /api/users/:id"])',
        },
        affectedRepos: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of repo names or paths that may be affected by the change',
        },
        severity: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'],
          description: 'Impact severity of the breaking change',
        },
        autoCreateFollowUp: {
          type: 'boolean',
          description:
            'When true, auto-create a follow-up feature in each affected repo. Default true.',
        },
      },
      required: ['projectPath', 'sourceRepo', 'changedInterfaces', 'affectedRepos', 'severity'],
    },
  },
  {
    name: 'resolve_cross_repo_dependency',
    description:
      'Mark a cross-repo external dependency as satisfied. Invalidates the 30-second TTL cache for the dependency so the scheduler re-checks it immediately, potentially unblocking downstream features.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory that owns the blocked feature',
        },
        featureId: {
          type: 'string',
          description: 'ID of the feature whose external dependency should be resolved',
        },
        externalAppPath: {
          type: 'string',
          description: 'appPath of the external dependency to mark as satisfied',
        },
        externalFeatureId: {
          type: 'string',
          description: 'featureId of the external dependency to mark as satisfied',
        },
      },
      required: ['projectPath', 'featureId', 'externalAppPath', 'externalFeatureId'],
    },
  },
];
