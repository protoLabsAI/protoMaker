/**
 * Calendar Management Tools
 *
 * Tools for managing calendar events:
 * - list_calendar_events: List calendar events in a date range
 * - create_calendar_event: Create a custom calendar event
 * - update_calendar_event: Update an existing calendar event
 * - delete_calendar_event: Delete a calendar event
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const calendarTools: Tool[] = [
  {
    name: 'list_calendar_events',
    description:
      'List calendar events within a date range. Returns aggregated events from various sources (custom events, feature due dates, milestones).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (e.g., "2026-02-01")',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (e.g., "2026-02-28")',
        },
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['custom', 'feature_due_date', 'milestone', 'job'],
          },
          description: 'Optional array of event types to filter by. If omitted, returns all types.',
        },
      },
      required: ['projectPath', 'startDate', 'endDate'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a custom calendar event. Returns the created event with its generated ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description: 'Event title',
        },
        date: {
          type: 'string',
          description: 'Event date in YYYY-MM-DD format (e.g., "2026-02-15")',
        },
        endDate: {
          type: 'string',
          description:
            'Optional end date for multi-day events in YYYY-MM-DD format. If omitted, this is a single-day event.',
        },
        type: {
          type: 'string',
          enum: ['custom', 'milestone', 'job'],
          description: 'Event type (default: "custom")',
        },
        description: {
          type: 'string',
          description: 'Optional event description',
        },
        color: {
          type: 'string',
          description: 'Optional color code for the event (e.g., "#FF5733")',
        },
        url: {
          type: 'string',
          description: 'Optional URL associated with the event',
        },
        time: {
          type: 'string',
          description: 'Time in HH:mm 24h format (required for job events, e.g., "14:30")',
        },
        jobAction: {
          type: 'object',
          description:
            'Action to execute (required for job events). One of: { type: "start-agent", featureId: "..." }, { type: "run-automation", automationId: "..." }, { type: "run-command", command: "...", cwd?: "..." }',
          properties: {
            type: {
              type: 'string',
              enum: ['start-agent', 'run-automation', 'run-command'],
            },
            featureId: { type: 'string' },
            automationId: { type: 'string' },
            command: { type: 'string' },
            cwd: { type: 'string' },
          },
          required: ['type'],
        },
      },
      required: ['projectPath', 'title', 'date'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event. Returns the updated event.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        id: {
          type: 'string',
          description: 'Event ID (UUID)',
        },
        title: {
          type: 'string',
          description: 'New event title (optional)',
        },
        date: {
          type: 'string',
          description: 'New event date in YYYY-MM-DD format (optional)',
        },
        endDate: {
          type: 'string',
          description: 'New end date in YYYY-MM-DD format (optional)',
        },
        description: {
          type: 'string',
          description: 'New event description (optional)',
        },
        color: {
          type: 'string',
          description: 'New color code (optional)',
        },
        url: {
          type: 'string',
          description: 'New URL (optional)',
        },
      },
      required: ['projectPath', 'id'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event. Returns success confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        id: {
          type: 'string',
          description: 'Event ID (UUID) to delete',
        },
      },
      required: ['projectPath', 'id'],
    },
  },
];
