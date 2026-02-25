/**
 * MCP tools for file operations (copy, move, browse)
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const copyFileTool: Tool = {
  name: 'copy_file',
  description:
    'Copy a file or directory recursively. Supports overwrite option and validates paths to prevent traversal attacks.',
  inputSchema: {
    type: 'object',
    properties: {
      sourcePath: {
        type: 'string',
        description: 'The source file or directory path to copy',
      },
      destinationPath: {
        type: 'string',
        description: 'The destination path for the copy',
      },
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite the destination if it exists (default: false)',
      },
    },
    required: ['sourcePath', 'destinationPath'],
  },
};

export const moveFileTool: Tool = {
  name: 'move_file',
  description: 'Move or rename a file or directory. Validates paths to prevent traversal attacks.',
  inputSchema: {
    type: 'object',
    properties: {
      sourcePath: {
        type: 'string',
        description: 'The source file or directory path to move/rename',
      },
      destinationPath: {
        type: 'string',
        description: 'The destination path for the move/rename operation',
      },
    },
    required: ['sourcePath', 'destinationPath'],
  },
};

export const browseProjectFilesTool: Tool = {
  name: 'browse_project_files',
  description:
    'Browse files and directories within a project. Returns name, relative path, and type information for each entry. Validates paths to prevent access outside the project directory.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'The root project directory path',
      },
      relativePath: {
        type: 'string',
        description: 'Optional relative path within the project to browse',
      },
      showHidden: {
        type: 'boolean',
        description: 'Whether to include hidden files (files starting with .) (default: false)',
      },
    },
    required: ['projectPath'],
  },
};

export const fileOpsTools = [copyFileTool, moveFileTool, browseProjectFilesTool];
