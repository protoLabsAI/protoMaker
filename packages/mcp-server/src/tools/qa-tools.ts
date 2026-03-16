/**
 * QA Tools — Aggregation and verification tools for the Quinn QA agent.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const qaTools: Tool[] = [
  {
    name: 'run_qa_check',
    description:
      'Run a consolidated QA health check that aggregates server health, service wiring, scheduler timers, deployment tracking, DORA metrics, board status, and pending signals into a single report. Designed for release verification and regression testing.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project to QA check',
        },
      },
      required: ['projectPath'],
    },
  },
];
