/**
 * Setup Tools (Research, Gap Analysis, Alignment)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const setupTools: Tool[] = [
  {
    name: 'research_repo',
    description:
      'Research a repository by reading key files (package.json, README, tsconfig, etc.) and generating a RepoResearchResult. Use this before setup_lab to generate tech-stack-aware configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory to research',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'analyze_gaps',
    description:
      'Analyze gaps between current repository state and desired Automaker configuration. Returns a list of missing or misconfigured items.',
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
    name: 'propose_alignment',
    description:
      'Generate a proposed alignment plan to fix gaps identified by analyze_gaps. Returns actionable steps.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        gaps: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Array of gap descriptions from analyze_gaps',
        },
      },
      required: ['projectPath', 'gaps'],
    },
  },
  {
    name: 'provision_discord',
    description:
      'Provision a Discord integration for the project. Creates a webhook and stores credentials securely.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        webhookUrl: {
          type: 'string',
          minLength: 1,
          description: 'Discord webhook URL',
        },
        channel: {
          type: 'string',
          minLength: 1,
          description: 'Discord channel name or ID',
        },
      },
      required: ['projectPath', 'webhookUrl'],
    },
  },
  {
    name: 'generate_report',
    description:
      'Generate a comprehensive project report including board status, metrics, and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Report format (default: markdown)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'run_full_setup',
    description:
      'Run the complete setup pipeline: research → analyze → propose → execute alignment. Automates the entire onboarding process.',
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
];
