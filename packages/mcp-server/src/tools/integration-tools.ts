/**
 * External Integration Tools (HITL, Actionable Items)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const integrationTools: Tool[] = [
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
