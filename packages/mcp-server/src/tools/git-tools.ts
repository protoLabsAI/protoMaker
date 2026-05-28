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
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'integer',
          minimum: 1,
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
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'integer',
          minimum: 1,
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
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'integer',
          minimum: 1,
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
      'Resolve all unresolved CodeRabbit review threads for a PR using the GitHub GraphQL resolveReviewThread mutation. Fetches PRRT_ thread node IDs (not PRRC_ comment IDs) and resolves each one. Supports an optional minSeverity gate. Returns resolvedCount and skippedCount.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'integer',
          minimum: 1,
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
          minLength: 1,
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
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          minLength: 1,
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
          minLength: 1,
          description: 'Absolute path to the worktree directory',
        },
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the main project directory (optional)',
        },
        commitMessage: {
          type: 'string',
          minLength: 1,
          description: 'Commit message (optional, auto-generated if not provided)',
        },
        prTitle: {
          type: 'string',
          minLength: 1,
          description: 'PR title (optional, auto-generated if not provided)',
        },
        prBody: {
          type: 'string',
          description: 'PR body/description (optional)',
        },
        baseBranch: {
          type: 'string',
          minLength: 1,
          description:
            'Base branch for the PR (optional, defaults to prBaseBranch from project settings or the repo default branch)',
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
    name: 'get_pr_review_comments',
    description:
      'List inline code review comment threads on a PR via GitHub GraphQL API. Returns thread IDs, file paths, line numbers, and comment bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'integer',
          minimum: 1,
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
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        threadId: {
          type: 'string',
          minLength: 1,
          description: 'GitHub review thread node ID (from get_pr_review_comments)',
        },
      },
      required: ['projectPath', 'threadId'],
    },
  },
  {
    name: 'add_github_comment',
    description:
      'Post a comment to an existing GitHub issue. Returns the comment URL and confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        issueNumber: {
          type: 'integer',
          minimum: 1,
          description: 'GitHub issue number to comment on',
        },
        body: {
          type: 'string',
          minLength: 1,
          description: 'Comment body (supports markdown)',
        },
      },
      required: ['projectPath', 'issueNumber', 'body'],
    },
  },
  {
    name: 'verify_triage_evidence',
    description:
      'Deterministically verify that the file paths you cite as triage evidence actually exist at a git ref, BEFORE applying a classification. You MUST call this before applying any closure-equivalent label (already_fixed, duplicate, not_a_bug, wontfix, resolved, not_reproducible, invalid, works_as_intended). If `classificationAllowed` is false, do NOT apply that classification — re-investigate against the real source or escalate as needs-investigation. Prevents the silent failure mode where an issue is wrongly marked already-fixed against a non-existent codebase (#3972).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the repository being triaged',
        },
        classification: {
          type: 'string',
          description:
            'The classification you intend to apply (e.g. already_fixed, duplicate, needs_investigation)',
        },
        citedPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'The file paths you cite as evidence for your classification',
        },
        ref: {
          type: 'string',
          description: 'Git ref to check the paths against (default: HEAD)',
        },
      },
      required: ['projectPath', 'citedPaths'],
    },
  },
];
