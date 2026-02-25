/**
 * Git and GitHub Operations Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const gitTools: Tool[] = [
  {
    name: 'merge_pr',
    description:
      'Merge a pull request using GitHub CLI. Supports different merge strategies (merge, squash, rebase) and can optionally wait for CI checks to pass before merging.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to merge',
        },
        strategy: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          default: 'squash',
          description: 'Merge strategy to use (default: squash)',
        },
        waitForCI: {
          type: 'boolean',
          default: true,
          description: 'Whether to wait for CI checks to pass before merging (default: true)',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },
  {
    name: 'check_pr_status',
    description:
      'Check the CI check status of a pull request. Returns information about passed, failed, and pending checks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to check status for',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },
  {
    name: 'get_pr_feedback',
    description:
      'Fetch CodeRabbit review feedback for a PR, including both issue-level and inline review threads with severity. Returns parsed feedback without resolving threads.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to fetch CodeRabbit feedback for',
        },
        includeInlineThreads: {
          type: 'boolean',
          description: 'Whether to include inline review threads (default: false)',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },
  {
    name: 'resolve_pr_threads',
    description:
      'Resolve CodeRabbit review threads for a PR. Respects severity gates - only resolves threads that meet severity thresholds. Must call get_pr_feedback first.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to resolve threads for',
        },
        minSeverity: {
          type: 'string',
          description:
            'Minimum severity to resolve (low, medium, high). Default: low (resolves all)',
          enum: ['low', 'medium', 'high'],
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },

  {
    name: 'list_worktrees',
    description:
      'List all git worktrees for a project. Returns worktree paths, branches, and optionally PR info.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        includeDetails: {
          type: 'boolean',
          description: 'Include file change counts and PR info (default: false)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_worktree_status',
    description:
      'Get the git status of a specific worktree for a feature. Returns modified files, diff stats, and recent commits.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to get worktree status for',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'create_pr_from_worktree',
    description:
      'Commit, push, and create a PR from a worktree. Handles the full workflow: stage changes, commit, push branch, create GitHub PR.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreePath: {
          type: 'string',
          description: 'Absolute path to the worktree directory',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the main project directory (optional)',
        },
        commitMessage: {
          type: 'string',
          description: 'Commit message (optional, auto-generated if not provided)',
        },
        prTitle: {
          type: 'string',
          description: 'PR title (optional, auto-generated if not provided)',
        },
        prBody: {
          type: 'string',
          description: 'PR body/description (optional)',
        },
        baseBranch: {
          type: 'string',
          description: 'Base branch for the PR (optional, defaults to main)',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (default: false)',
        },
      },
      required: ['worktreePath'],
    },
  },
  {
    name: 'worktree_cherry_pick',
    description:
      'Cherry-picks one or more commits into a worktree. Commit hashes must be valid hex strings (4-40 chars).',
    inputSchema: {
      type: 'object',
      properties: {
        worktreePath: {
          type: 'string',
          description: 'Absolute path to the worktree directory',
        },
        commits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of commit hashes to cherry-pick (applied in order)',
        },
      },
      required: ['worktreePath', 'commits'],
    },
  },
  {
    name: 'worktree_abort_operation',
    description:
      'Aborts an in-progress rebase, merge, or cherry-pick operation in a worktree. Detects the operation type automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreePath: {
          type: 'string',
          description: 'Absolute path to the worktree directory',
        },
      },
      required: ['worktreePath'],
    },
  },
  {
    name: 'worktree_continue_operation',
    description:
      'Continues an in-progress rebase, merge, or cherry-pick after conflict resolution in a worktree.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreePath: {
          type: 'string',
          description: 'Absolute path to the worktree directory',
        },
      },
      required: ['worktreePath'],
    },
  },
  {
    name: 'get_pr_review_comments',
    description:
      'List inline code review comment threads on a PR via GitHub GraphQL API. Returns thread IDs, file paths, line numbers, and comment bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to fetch review comments for',
        },
        includeResolved: {
          type: 'boolean',
          description: 'Whether to include already-resolved threads (default: false)',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },
  {
    name: 'resolve_pr_comment',
    description:
      'Resolve a single PR review thread by thread ID via GitHub GraphQL resolveReviewThread mutation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        threadId: {
          type: 'string',
          description: 'GitHub review thread node ID (from get_pr_review_comments)',
        },
      },
      required: ['projectPath', 'threadId'],
    },
  },
];
