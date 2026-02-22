/**
 * External Integration Tools (Linear, Discord, Twitch, HITL)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const integrationTools: Tool[] = [
  {
    name: 'sync_project_to_linear',
    description:
      'Sync Automaker project milestones to Linear project milestones. Creates/updates milestones, matches issues to milestones by epic title, assigns issues, and optionally deletes placeholder milestones. Idempotent — safe to re-run.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'Project slug (e.g., "copilotkit-langgraph-side-panel")',
        },
        linearProjectId: {
          type: 'string',
          description: 'Linear project ID (optional, uses project.linearProjectId if not provided)',
        },
        cleanupPlaceholders: {
          type: 'boolean',
          description:
            'Delete Linear milestones that do not match any Automaker milestone (default: false)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },

  {
    name: 'send_discord_dm',
    description:
      'Send a direct message to a Discord user by username. Uses the Automaker Discord bot to deliver the DM.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Discord username to send the DM to (e.g., "chukz")',
        },
        content: {
          type: 'string',
          description: 'Message content to send',
        },
      },
      required: ['username', 'content'],
    },
  },
  {
    name: 'read_discord_dms',
    description:
      'Read recent direct messages with a Discord user by username. Returns messages from the DM channel between the bot and the user.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Discord username to read DMs from (e.g., "chukz")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10, max: 100)',
        },
      },
      required: ['username'],
    },
  },

  {
    name: 'twitch_list_suggestions',
    description:
      'View Twitch chat suggestion queue with filtering. Use filter="unprocessed" to see only new suggestions, "approved" for processed ones, or "all" for everything.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'unprocessed', 'approved'],
          description: 'Filter suggestions by processing status',
          default: 'all',
        },
      },
    },
  },
  {
    name: 'twitch_build_suggestion',
    description:
      'Approve a Twitch suggestion and create a board feature directly (skip poll). Marks suggestion as processed and creates feature with chat attribution.',
    inputSchema: {
      type: 'object',
      properties: {
        suggestionId: {
          type: 'string',
          description: 'ID of the suggestion to build',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['suggestionId', 'projectPath'],
    },
  },
  {
    name: 'twitch_create_poll',
    description:
      'Create a native Twitch poll from 2-4 selected suggestions. When poll ends, winning suggestion auto-creates a board feature. Requires Twitch API credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        suggestionIds: {
          type: 'array',
          items: {
            type: 'string',
          },
          minItems: 2,
          maxItems: 4,
          description: 'Array of 2-4 suggestion IDs to include in the poll',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        durationSeconds: {
          type: 'number',
          description: 'Poll duration in seconds (15-1800, default: 60)',
          default: 60,
          minimum: 15,
          maximum: 1800,
        },
      },
      required: ['suggestionIds', 'projectPath'],
    },
  },

  {
    name: 'request_user_input',
    description:
      'Create a HITL form request that renders as a dialog in the UI. ' +
      'Provide JSON Schema definitions for each form step. ' +
      'Returns a formId — poll with get_form_response to check for the user response.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description: 'Form dialog title shown to the user',
        },
        description: {
          type: 'string',
          description: 'Optional description shown below the title',
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              schema: {
                type: 'object',
                description: 'JSON Schema (draft-07) defining the form fields',
              },
              uiSchema: {
                type: 'object',
                description: '@rjsf layout hints (field ordering, widgets)',
              },
              title: {
                type: 'string',
                description: 'Step title shown in wizard header',
              },
              description: {
                type: 'string',
                description: 'Step description',
              },
            },
            required: ['schema'],
          },
          minItems: 1,
          description: 'One or more form steps. Multiple steps render as a wizard.',
        },
        featureId: {
          type: 'string',
          description: 'Optional feature ID to associate with the form',
        },
        ttlSeconds: {
          type: 'number',
          description: 'Time-to-live in seconds before auto-expiry (default: 3600)',
        },
      },
      required: ['projectPath', 'title', 'steps'],
    },
  },
  {
    name: 'get_form_response',
    description:
      'Check the status of a HITL form request and retrieve the user response when submitted. ' +
      'Poll this after calling request_user_input.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The form ID returned by request_user_input',
        },
      },
      required: ['formId'],
    },
  },
];
