/**
 * Agent Control and Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const agentTools: Tool[] = [
  {
    name: 'start_agent',
    description:
      'Start an AI agent to work on a feature. The agent will create a git worktree and begin implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to work on',
        },
        useWorktrees: {
          type: 'boolean',
          description:
            'Whether to use isolated git worktrees for the agent (default: true). When true, agent works in a separate worktree based on the feature branch.',
          default: true,
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'stop_agent',
    description: 'Stop a running agent.',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: {
          type: 'string',
          description: 'The feature ID of the running agent',
        },
        targetStatus: {
          type: 'string',
          enum: ['backlog', 'done', 'verified'],
          description:
            "Final status to set after stopping the agent. Use 'done' to mark the feature complete and prevent auto-mode from respawning it. Defaults to 'backlog'.",
        },
      },
      required: ['featureId'],
    },
  },
  {
    name: 'list_running_agents',
    description: 'List all currently running agents across all projects.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_agent_output',
    description:
      "Get the output/log from an agent's execution on a feature. Useful for reviewing what the agent did.",
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID',
        },
        maxLines: {
          type: 'number',
          description:
            'Maximum lines to return (default: 200). Use -1 for unlimited. Returns the last N lines.',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'send_message_to_agent',
    description:
      'Send a message to a running agent. Use this to provide clarification or additional instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID of the running agent',
        },
        message: {
          type: 'string',
          description: 'Message to send to the agent',
        },
      },
      required: ['projectPath', 'featureId', 'message'],
    },
  },
];
