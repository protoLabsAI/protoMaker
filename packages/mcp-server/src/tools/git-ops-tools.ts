/**
 * MCP tools for git operations (enhanced status, stage files, file details)
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const gitEnhancedStatusTool: Tool = {
  name: 'git_enhanced_status',
  description:
    'Get detailed per-file git status including index status, work tree status, conflict markers, staged state, and line-change counts.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the git repository',
      },
    },
    required: ['projectPath'],
  },
};

export const gitStageFilesTool: Tool = {
  name: 'git_stage_files',
  description:
    'Stage specific files for the next commit (git add). Accepts an array of file paths relative to the project root.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the git repository',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of file paths (relative to projectPath) to stage',
      },
    },
    required: ['projectPath', 'files'],
  },
};

export const gitFileDetailsTool: Tool = {
  name: 'git_file_details',
  description:
    'Get the last commit information for a specific file including commit hash, message, author, and timestamp.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the git repository',
      },
      filePath: {
        type: 'string',
        description: 'Path to the file (relative to projectPath or absolute)',
      },
    },
    required: ['projectPath', 'filePath'],
  },
};

export const gitOpsTools = [gitEnhancedStatusTool, gitStageFilesTool, gitFileDetailsTool];
