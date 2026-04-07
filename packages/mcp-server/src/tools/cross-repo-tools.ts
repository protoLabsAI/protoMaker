/**
 * Cross-Repository Dependency Tools
 *
 * Three tools that expose cross-repo dependency management to MCP callers:
 *   get_cross_repo_dependencies  — portfolio-scope dep graph
 *   flag_cross_repo_dependency   — record an interface-change dep (Quinn)
 *   resolve_cross_repo_dependency — mark a dep as satisfied, unblock features
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const crossRepoTools: Tool[] = [
  {
    name: 'get_cross_repo_dependencies',
    description:
      'Get the cross-repository dependency graph across all projects in the portfolio. ' +
      'Returns nodes (repos), edges (dependencies with type and status), ' +
      'the critical path of unsatisfied dependencies, and any circular dependency risks. ' +
      'Use this to understand which cross-repo blockers are holding up the most work.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPaths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of project paths to scope the graph. When omitted, uses all projects from GlobalSettings.',
        },
      },
    },
  },
  {
    name: 'flag_cross_repo_dependency',
    description:
      'Record a cross-repository dependency on a feature. ' +
      'Call this when a PR introduces a breaking interface change that affects other repos ' +
      '(exported symbol rename, REST endpoint change, CLI flag change). ' +
      'Creates an externalDependency entry on the target feature and optionally auto-creates ' +
      'follow-up features in affected downstream repos. ' +
      'Emits a dependency:interface_changed event for portfolio visibility.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project that owns the feature being blocked',
        },
        featureId: {
          type: 'string',
          description: 'ID of the feature that needs the external dependency',
        },
        dependencyAppPath: {
          type: 'string',
          description: 'Absolute path to the foreign app that this feature depends on',
        },
        dependencyFeatureId: {
          type: 'string',
          description: 'Feature ID in the foreign app that must complete first',
        },
        description: {
          type: 'string',
          description:
            'Human-readable description of what this feature needs (e.g. "requires new /api/portfolio endpoint")',
        },
        dependencyType: {
          type: 'string',
          enum: ['api_contract', 'shared_type', 'deployment_order', 'data_migration'],
          description: 'Category of the contract creating this dependency',
        },
        prNumber: {
          type: 'number',
          description:
            'Optional PR number for traceability (e.g. the PR that introduced the breaking change)',
        },
      },
      required: [
        'projectPath',
        'featureId',
        'dependencyAppPath',
        'dependencyFeatureId',
        'description',
        'dependencyType',
      ],
    },
  },
  {
    name: 'resolve_cross_repo_dependency',
    description:
      'Mark a cross-repository dependency as satisfied. ' +
      'Call this when the foreign feature has reached done/review status and the blocking dep should be cleared. ' +
      'Updates the externalDependency status to "satisfied" and re-evaluates all features waiting on this dep, ' +
      'unblocking any whose remaining external deps are now fully satisfied.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project that owns the blocked feature',
        },
        featureId: {
          type: 'string',
          description: 'ID of the blocked feature to update',
        },
        dependencyAppPath: {
          type: 'string',
          description: 'Absolute path to the foreign app whose dependency is now satisfied',
        },
        dependencyFeatureId: {
          type: 'string',
          description: 'Feature ID in the foreign app that has now completed',
        },
      },
      required: ['projectPath', 'featureId', 'dependencyAppPath', 'dependencyFeatureId'],
    },
  },
];
