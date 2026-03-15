/**
 * Scheduler Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const schedulerTools: Tool[] = [
  {
    name: 'get_scheduler_status',
    description:
      'Get the status of all scheduled timers (cron tasks and managed intervals) including their schedules, enable/disable state, execution counts, and next run times.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_maintenance_task',
    description:
      'Update a maintenance task — enable/disable it or change its cron schedule. Changes persist across server restarts via GlobalSettings.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description:
            'The task ID (e.g., "maintenance:data-integrity", "maintenance:stale-features")',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether to enable or disable the task',
        },
        cronExpression: {
          type: 'string',
          description:
            'New cron expression for the task schedule (5-field format: "minute hour dayOfMonth month dayOfWeek")',
        },
      },
      required: ['taskId'],
    },
  },
];
