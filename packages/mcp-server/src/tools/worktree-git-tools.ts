/**
 * MCP tools for worktree git operations (stash push/list/apply/drop)
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const worktreeStashPushTool: Tool = {
  name: 'worktree_stash_push',
  description:
    'Stash uncommitted changes in a worktree. Optionally provide a message or limit stashing to specific files.',
  inputSchema: {
    type: 'object',
    properties: {
      worktreePath: {
        type: 'string',
        description: 'Absolute path to the worktree directory',
      },
      message: {
        type: 'string',
        description: 'Optional stash message for easy identification',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of specific file paths to stash (relative to worktreePath)',
      },
    },
    required: ['worktreePath'],
  },
};

export const worktreeStashListTool: Tool = {
  name: 'worktree_stash_list',
  description:
    'List all stash entries for a worktree. Returns ref, message, branch, and index for each stash.',
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
};

export const worktreeStashApplyTool: Tool = {
  name: 'worktree_stash_apply',
  description:
    'Apply a stash to the worktree without removing it from the stash list. Use worktree_stash_list to get valid stash refs (e.g. "stash@{0}").',
  inputSchema: {
    type: 'object',
    properties: {
      worktreePath: {
        type: 'string',
        description: 'Absolute path to the worktree directory',
      },
      stashRef: {
        type: 'string',
        description: 'Stash reference to apply (e.g. "stash@{0}")',
      },
    },
    required: ['worktreePath', 'stashRef'],
  },
};

export const worktreeStashDropTool: Tool = {
  name: 'worktree_stash_drop',
  description:
    'Drop (remove) a specific stash entry from a worktree stash list. Use worktree_stash_list to get valid refs.',
  inputSchema: {
    type: 'object',
    properties: {
      worktreePath: {
        type: 'string',
        description: 'Absolute path to the worktree directory',
      },
      stashRef: {
        type: 'string',
        description: 'Stash reference to drop (e.g. "stash@{0}")',
      },
    },
    required: ['worktreePath', 'stashRef'],
  },
};

export const worktreeGitTools = [
  worktreeStashPushTool,
  worktreeStashListTool,
  worktreeStashApplyTool,
  worktreeStashDropTool,
];
