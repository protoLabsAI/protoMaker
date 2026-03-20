/**
 * Workspace Management Tools (Board, Notes)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const workspaceTools: Tool[] = [
  {
    name: 'query_board',
    description:
      'Query features with compound filters. Supports filtering by status, epic, complexity, blocked state, dependencies, date range, and text search. Returns compact results to minimize context usage.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        status: {
          oneOf: [
            {
              type: 'string',
              enum: ['backlog', 'in_progress', 'review', 'done', 'blocked', 'verified'],
            },
            {
              type: 'array',
              items: {
                type: 'string',
                enum: ['backlog', 'in_progress', 'review', 'done', 'blocked', 'verified'],
              },
            },
          ],
          description: 'Filter by status (single or array)',
        },
        epicId: {
          type: 'string',
          description: 'Filter by parent epic ID',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description: 'Filter by complexity level',
        },
        isEpic: {
          type: 'boolean',
          description: 'Filter for epic features only (true) or non-epic only (false)',
        },
        isBlocked: {
          type: 'boolean',
          description: 'Filter for blocked features (true) or non-blocked (false)',
        },
        hasDependencies: {
          type: 'boolean',
          description: 'Filter for features with dependencies (true) or without (false)',
        },
        search: {
          type: 'string',
          description: 'Text search in title and description',
        },
        dueBefore: {
          type: 'string',
          description: 'Filter features with dueDate before this date (YYYY-MM-DD format)',
        },
        dueAfter: {
          type: 'string',
          description: 'Filter features with dueDate after this date (YYYY-MM-DD format)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 50)',
        },
      },
      required: ['projectPath'],
    },
  },

  {
    name: 'list_note_tabs',
    description:
      'List all note tabs in a project workspace. Returns tab names, permissions (agentRead/agentWrite), and word counts. Only tabs with agentRead enabled are shown by default.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        includeRestricted: {
          type: 'boolean',
          description: 'Include tabs where agentRead is false (default: false)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'read_note_tab',
    description:
      'Read the content of a specific note tab. Requires agentRead permission on the tab. Returns HTML content, word count, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        tabId: {
          type: 'string',
          description: 'The tab ID (UUID). Use list_note_tabs to discover tab IDs.',
        },
      },
      required: ['projectPath', 'tabId'],
    },
  },
  {
    name: 'write_note_tab',
    description:
      'Write content to a specific note tab. Requires agentWrite permission on the tab. Supports replace (default) or append mode. Content should be TipTap-compatible HTML. Optionally rename the tab or update its permissions in the same call.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        tabId: {
          type: 'string',
          description: 'The tab ID (UUID). Use list_note_tabs to discover tab IDs.',
        },
        content: {
          type: 'string',
          description: 'HTML content to write. For rich text, use TipTap-compatible HTML tags.',
        },
        mode: {
          type: 'string',
          enum: ['replace', 'append'],
          description: 'Write mode: replace (default) overwrites, append adds to end',
        },
        name: {
          type: 'string',
          description: 'Optional new name for the tab',
        },
        permissions: {
          type: 'object',
          description: 'Optional permission updates for the tab',
          properties: {
            agentRead: { type: 'boolean', description: 'Whether agents can read this tab' },
            agentWrite: { type: 'boolean', description: 'Whether agents can write to this tab' },
          },
        },
      },
      required: ['projectPath', 'tabId', 'content'],
    },
  },

  {
    name: 'create_note_tab',
    description: 'Create a new note tab in the workspace. Returns the created tab with its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        name: {
          type: 'string',
          description: 'Tab name (defaults to "Tab N")',
        },
        content: {
          type: 'string',
          description: 'Initial HTML content (defaults to empty)',
        },
        permissions: {
          type: 'object',
          description: 'Tab permissions',
          properties: {
            agentRead: { type: 'boolean', description: 'Allow agent to read this tab' },
            agentWrite: { type: 'boolean', description: 'Allow agent to write to this tab' },
          },
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'delete_note_tab',
    description: 'Delete a note tab from the workspace. Cannot delete the last remaining tab.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        tabId: {
          type: 'string',
          description: 'The tab ID (UUID) to delete',
        },
      },
      required: ['projectPath', 'tabId'],
    },
  },
];
