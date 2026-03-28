/**
 * Feature Management Tools
 *
 * Tools for managing features on the Kanban board:
 * - list_features: List all features
 * - get_feature: Get feature details
 * - create_feature: Create new feature
 * - update_feature: Update feature properties (including status changes)
 * - delete_feature: Delete feature
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
        projectSlug: {
          type: 'string',
          description:
            'Filter features by project slug (optional). Only returns features whose projectSlug matches.',
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
        category: {
          type: 'string',
          description:
            'Category for organizing this feature on the board (optional, defaults to "Uncategorized"). Examples: "infrastructure", "frontend", "api", "bug-fix".',
        },
        projectSlug: {
          type: 'string',
          description:
            'Optional project slug to scope this feature to a specific project. Features with a projectSlug appear in project-filtered views (e.g., get_sitrep with projectSlug). Leave unset for standalone features.',
        },
        executionMode: {
          type: 'string',
          enum: ['standard', 'read-only'],
          description:
            'Execution mode: "standard" (default) runs the full git pipeline (worktree, branch, commit, push, PR). "read-only" runs the agent against the main working tree with no git operations — ideal for audits, analysis, and report generation.',
        },
        workflow: {
          type: 'string',
          description:
            'Workflow name from .automaker/workflows/ or built-in (standard, read-only, content, audit). Determines which pipeline phases run, which processors handle each phase, and execution settings. Overrides executionMode when set.',
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
        epicId: {
          type: ['string', 'null'],
          description:
            'ID of parent epic to group this feature under. Pass null to remove from epic.',
        },
        isFoundation: {
          type: 'boolean',
          description:
            'Mark as foundation feature (package scaffold, base types). Downstream features wait for this to be merged before starting.',
        },
        statusChangeReason: {
          type: 'string',
          description:
            "Required when setting status to 'blocked'. Explain why the feature is blocked (e.g., 'Waiting on PR #123 to merge', 'Blocked by API rate limits').",
        },
        category: {
          type: 'string',
          description:
            'Category for organizing this feature on the board (optional). Examples: "infrastructure", "frontend", "api", "bug-fix".',
        },
        executionMode: {
          type: 'string',
          enum: ['standard', 'read-only'],
          description:
            'Execution mode: "standard" runs the full git pipeline. "read-only" runs with no git operations.',
        },
        workflow: {
          type: 'string',
          description:
            'Workflow name (standard, read-only, content, audit, or custom). Determines pipeline phases and processors.',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'delete_feature',
    description: 'Delete a feature from the board. This is a destructive action.',
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
  {
    name: 'rollback_feature',
    description:
      "Rollback a deployed feature by reverting its merge commit. Finds the merge commit from the feature's prNumber, runs git revert -m 1, and moves the feature back to review status.",
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory (git repo root)',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID) to roll back',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'list_workflows',
    description:
      'List all available workflows for a project. Returns built-in workflows (standard, read-only, content, audit, research, tech-debt-scan, postmortem, dependency-health, cost-analysis, strategic-review, changelog-digest, swebench) plus any project-specific YAML overrides from .automaker/workflows/.',
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
];
