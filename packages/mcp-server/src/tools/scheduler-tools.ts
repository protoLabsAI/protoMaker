/**
 * Scheduler Tools (Maintenance Tasks)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const schedulerTools: Tool[] = [
  {
    name: 'get_scheduler_status',
    description:
      'Get the status of the maintenance task scheduler. Returns scheduled tasks, next run times, and last execution results.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'update_maintenance_task',
    description:
      'Update a maintenance task configuration. Can change schedule, enable/disable, or update parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        taskId: {
          type: 'string',
          minLength: 1,
          description: 'The maintenance task ID to update',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the task is enabled (optional)',
        },
        schedule: {
          type: 'string',
          minLength: 1,
          description: 'Cron expression for the task schedule (optional)',
        },
        parameters: {
          type: 'object',
          description: 'Task-specific parameters (optional)',
        },
      },
      required: ['projectPath', 'taskId'],
    },
  },
];
