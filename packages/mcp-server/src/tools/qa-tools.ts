/**
 * QA (Quality Assurance) Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const qaTools: Tool[] = [
  {
    name: 'run_qa_check',
    description:
      'Run automated quality assurance checks on a project or feature. Checks include code quality, test coverage, documentation completeness, and security scanning.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          minLength: 1,
          description: 'Optional feature ID to scope the check to a specific feature',
        },
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['lint', 'typecheck', 'tests', 'coverage', 'security', 'docs', 'all'],
          },
          description: 'Which checks to run (default: ["all"])',
        },
        failOn: {
          type: 'string',
          enum: ['error', 'warning', 'info'],
          description: 'Minimum severity to fail the check (default: error)',
        },
      },
      required: ['projectPath'],
    },
  },
];
