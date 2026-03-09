/**
 * External Integration Tools (Discord, Twitch, HITL)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const integrationTools: Tool[] = [
  {
    name: 'send_discord_dm',
    description:
      'Send a direct message to a Discord user by username. Uses the Automaker Discord bot to deliver the DM.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Discord username to send the DM to (e.g., "username123")',
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
          description: 'Discord username to read DMs from (e.g., "username123")',
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
    name: 'send_discord_channel_message',
    description:
      'Send a message or embed to a Discord channel by channel ID. Use embed for structured notifications (errors, status updates, heartbeats).',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Discord channel ID to send the message to',
        },
        content: {
          type: 'string',
          description: 'Plain text message content (required if no embed)',
        },
        embed: {
          type: 'object',
          description: 'Rich embed object. When provided, sends as an embed instead of plain text.',
          properties: {
            title: { type: 'string', description: 'Embed title' },
            description: { type: 'string', description: 'Embed body text' },
            color: {
              type: 'number',
              description: 'Embed color as decimal (e.g. 3066993 for green, 15548997 for red)',
            },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'string' },
                  inline: { type: 'boolean' },
                },
                required: ['name', 'value'],
              },
              description: 'Embed fields',
            },
            footer: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
            timestamp: {
              type: 'string',
              description: 'ISO 8601 timestamp',
            },
          },
          required: ['title'],
        },
      },
      required: ['channelId'],
    },
  },
  {
    name: 'read_discord_channel_messages',
    description:
      'Read recent messages from a Discord channel by channel ID. Returns messages with author, content, and timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Discord channel ID to read messages from',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10, max: 100)',
        },
      },
      required: ['channelId'],
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

  {
    name: 'list_pending_forms',
    description:
      'List all pending HITL form requests for a project. Returns form summaries with formId, title, featureId, and expiresAt.',
    _meta: { avaOnly: true },
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
    name: 'submit_form_response',
    description:
      'Programmatically submit a response to a pending HITL form. Allows Ava to answer form questions on behalf of the user, which resumes the waiting agent.',
    _meta: { avaOnly: true },
    inputSchema: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The form ID to submit a response for',
        },
        response: {
          type: 'object',
          description: 'The response data matching the form schema',
        },
      },
      required: ['formId', 'response'],
    },
  },

  {
    name: 'cancel_form',
    description: 'Cancel a pending HITL form request, dismissing it without a response.',
    _meta: { avaOnly: true },
    inputSchema: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The form ID to cancel',
        },
      },
      required: ['formId'],
    },
  },

  {
    name: 'list_actionable_items',
    description:
      'List actionable items requiring attention, with optional filtering by project and category.',
    _meta: { avaOnly: true },
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory (optional filter)',
        },
        category: {
          type: 'string',
          description: 'Category filter (optional)',
        },
      },
    },
  },

  {
    name: 'act_on_actionable_item',
    description:
      'Update the status of an actionable item by acting on it, dismissing, or snoozing.',
    _meta: { avaOnly: true },
    inputSchema: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'The actionable item ID to update',
        },
        action: {
          type: 'string',
          enum: ['acted', 'dismissed', 'snoozed'],
          description: 'The action to take on the item',
        },
      },
      required: ['itemId', 'action'],
    },
  },
];
