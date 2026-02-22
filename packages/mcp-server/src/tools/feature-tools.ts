/**
 * Feature Management Tools
 *
 * Tools for managing features on the Kanban board:
 * - list_features: List all features
 * - get_feature: Get feature details
 * - create_feature: Create new feature
 * - update_feature: Update feature properties
 * - delete_feature: Delete feature
 * - move_feature: Move feature between columns
 * - update_feature_git_settings: Update git workflow settings
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const featureTools: Tool[] = [
  {
    name: 'list_features',
    description:
      'List all features in a project. Returns features organized by status (backlog, in-progress, review, done).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress', 'review', 'done'],
          description: 'Filter by status (optional)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_feature',
    description:
      'Get detailed information about a specific feature including its description, status, and agent output.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        includeHistory: {
          type: 'boolean',
          description:
            'Include full executionHistory, descriptionHistory, statusHistory, and planSpec (default: false to save context)',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'create_feature',
    description:
      'Create a new feature on the Kanban board. Features start in the backlog by default.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description: 'Short title for the feature',
        },
        description: {
          type: 'string',
          description:
            'Detailed description with requirements and acceptance criteria. Be specific about file locations, components, and expected behavior.',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress'],
          default: 'backlog',
          description: "Initial status. Use 'in-progress' to immediately start an agent.",
        },
        branchName: {
          type: 'string',
          description:
            'Optional git branch name for this feature. If not provided, auto-generated from title.',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of feature IDs that this feature depends on.',
        },
        isEpic: {
          type: 'boolean',
          description:
            'Set to true to mark this feature as an epic (container for child features).',
        },
        epicId: {
          type: 'string',
          description: 'ID of parent epic if this feature belongs to an epic.',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description:
            'Feature complexity level for model selection. small=haiku, medium/large=sonnet, architectural=opus. Features that fail 2+ times auto-escalate to opus.',
        },
        assignee: {
          type: 'string',
          description:
            "Who this feature is assigned to. If set to a human name (e.g., 'josh'), auto-mode will skip this feature. If set to 'agent' or undefined, auto-mode can pick it up.",
        },
        dueDate: {
          type: 'string',
          description:
            'Due date for this feature in ISO 8601 format (YYYY-MM-DD). Example: "2026-02-10".',
        },
        priority: {
          type: 'number',
          enum: [0, 1, 2, 3, 4],
          description:
            'Priority level: 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low. Auto-mode picks higher priority first.',
        },
        isFoundation: {
          type: 'boolean',
          description:
            'Mark as foundation feature (package scaffold, base types). Downstream features wait for this to be merged before starting.',
        },
      },
      required: ['projectPath', 'title', 'description'],
    },
  },
  {
    name: 'update_feature',
    description:
      "Update a feature's properties. Can be used to change status, title, description, or move between columns.",
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        title: {
          type: 'string',
          description: 'New title (optional)',
        },
        description: {
          type: 'string',
          description: 'New description (optional)',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress', 'review', 'done'],
          description: "New status (optional). Moving to 'in-progress' starts an agent.",
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description:
            'Feature complexity level for model selection. small=haiku, medium/large=sonnet, architectural=opus.',
        },
        assignee: {
          type: ['string', 'null'],
          description:
            "Who this feature is assigned to. If set to a human name (e.g., 'josh'), auto-mode will skip this feature. If set to 'agent' or undefined, auto-mode can pick it up. Pass null to unassign.",
        },
        dueDate: {
          type: ['string', 'null'],
          description:
            'Due date for this feature in ISO 8601 format (YYYY-MM-DD). Pass null to clear.',
        },
        priority: {
          type: ['number', 'null'],
          enum: [0, 1, 2, 3, 4, null],
          description:
            'Priority level: 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low. Pass null to clear.',
        },
        isFoundation: {
          type: 'boolean',
          description:
            'Mark as foundation feature (package scaffold, base types). Downstream features wait for this to be merged before starting.',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'delete_feature',
    description: 'Delete a feature from the board.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'move_feature',
    description:
      'Move a feature to a different column on the board. This is a convenience wrapper around update_feature.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress', 'review', 'done'],
          description: "Target status/column. Moving to 'in-progress' starts an agent.",
        },
      },
      required: ['projectPath', 'featureId', 'status'],
    },
  },
  {
    name: 'update_feature_git_settings',
    description:
      'Update git workflow settings for a specific feature. Override global git workflow settings (auto-commit, auto-push, auto-PR, auto-merge) on a per-feature basis.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        autoCommit: {
          type: 'boolean',
          description: 'Auto-commit changes when feature completes (optional)',
        },
        autoPush: {
          type: 'boolean',
          description: 'Auto-push to remote after commit (optional)',
        },
        autoCreatePR: {
          type: 'boolean',
          description: 'Auto-create pull request after push (optional)',
        },
        autoMergePR: {
          type: 'boolean',
          description: 'Auto-merge pull request after creation (optional)',
        },
        prMergeStrategy: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: 'PR merge strategy: merge, squash, or rebase (optional)',
        },
        waitForCI: {
          type: 'boolean',
          description: 'Wait for CI checks to pass before merging (optional)',
        },
        prBaseBranch: {
          type: 'string',
          description: 'Base branch for PR creation (optional, default: main)',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
];
