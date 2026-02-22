/**
 * Context Files and Skills Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const contextTools: Tool[] = [
  {
    name: 'list_context_files',
    description:
      "List all context files in a project's .automaker/context/ directory. These files are injected into agent prompts.",
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
  {
    name: 'get_context_file',
    description: 'Read the contents of a context file.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filename: {
          type: 'string',
          description: "Name of the context file (e.g., 'coding-rules.md')",
        },
      },
      required: ['projectPath', 'filename'],
    },
  },
  {
    name: 'create_context_file',
    description:
      'Create a new context file that will be injected into all agent prompts for this project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filename: {
          type: 'string',
          description: "Name for the context file (should end in .md, e.g., 'coding-rules.md')",
        },
        content: {
          type: 'string',
          description: 'Markdown content for the context file. This will be shown to agents.',
        },
      },
      required: ['projectPath', 'filename', 'content'],
    },
  },
  {
    name: 'delete_context_file',
    description: 'Delete a context file.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filename: {
          type: 'string',
          description: 'Name of the context file to delete',
        },
      },
      required: ['projectPath', 'filename'],
    },
  },

  // ========== Skills ==========
  {
    name: 'list_skills',
    description:
      'List all learned skills in a project. Skills are reusable patterns stored in .automaker/skills/',
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
  {
    name: 'get_skill',
    description: 'Get the full content and metadata of a specific skill.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        skillName: {
          type: 'string',
          description: 'Name of the skill (without .md extension)',
        },
      },
      required: ['projectPath', 'skillName'],
    },
  },
  {
    name: 'create_skill',
    description:
      'Create a new skill from a learned pattern. Skills help agents reuse successful approaches.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        name: {
          type: 'string',
          description: 'Unique name for the skill (kebab-case, e.g., "git-commit-workflow")',
        },
        description: {
          type: 'string',
          description: 'Brief description of what the skill does',
        },
        content: {
          type: 'string',
          description: 'The skill content/instructions in markdown',
        },
        emoji: {
          type: 'string',
          description: 'Optional emoji for visual identification',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and discovery',
        },
      },
      required: ['projectPath', 'name', 'description', 'content'],
    },
  },
  {
    name: 'delete_skill',
    description: 'Delete a skill that is no longer needed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        skillName: {
          type: 'string',
          description: 'Name of the skill to delete',
        },
      },
      required: ['projectPath', 'skillName'],
    },
  },
];
