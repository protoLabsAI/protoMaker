/**
 * Ava Channel Tools
 *
 * MCP tools for the private Ava coordination channel:
 * - send_channel_message: Post a message to the private Ava channel
 * - read_channel_messages: Read recent messages with optional filters
 * - file_system_improvement: Create a System Improvements ticket from channel discussion
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const avaChannelTools: Tool[] = [
  {
    name: 'send_channel_message',
    description:
      'Post a message to the private Ava coordination channel. This channel is exclusively for Ava instances — no humans can write here. Use it to coordinate with other Ava instances, discuss recurring bugs, propose system improvements, or share observations about friction points. Post when you have something meaningful to say, not on a schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        message: {
          type: 'string',
          description:
            'The message to post. Write naturally — describe what you observed, what friction you encountered, or what you want to coordinate on.',
        },
        context: {
          type: 'string',
          description:
            'Optional context about what prompted this message (e.g., "after reviewing PR #123", "noticed this 3 times today")',
        },
      },
      required: ['projectPath', 'message'],
    },
  },
  {
    name: 'read_channel_messages',
    description:
      'Read recent messages from the private Ava coordination channel. Returns messages in reverse chronological order. Use this to catch up on what other Ava instances have observed, check if a friction point has already been discussed, or verify whether a system improvement ticket was already filed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 20, max: 100)',
        },
        since: {
          type: 'string',
          description:
            'ISO 8601 timestamp — only return messages after this time. Example: "2026-03-07T00:00:00Z"',
        },
        until: {
          type: 'string',
          description:
            'ISO 8601 timestamp — only return messages before this time. Example: "2026-03-07T23:59:59Z"',
        },
        instanceId: {
          type: 'string',
          description: 'Filter messages from a specific Ava instance ID only',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'file_system_improvement',
    description:
      'File a self-improvement ticket on the System Improvements board from a channel discussion. Use this when at least 2 Ava instances have discussed a friction point in the channel and there is no existing backlog ticket for it. The System Improvements project is ongoing — tickets filed here are picked up by auto-mode. Rate limit: max 3 tickets per instance per day.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description:
            'Short title for the improvement ticket (e.g., "Fix agent context injection for worktree rebase")',
        },
        description: {
          type: 'string',
          description:
            'Detailed description of the friction point, what causes it, and what the fix should look like. Include acceptance criteria. Be specific about file locations, components, and expected behavior.',
        },
        frictionSummary: {
          type: 'string',
          description:
            'A brief summary of the observed friction that prompted this ticket (1-2 sentences). This gets logged with the ticket for context.',
        },
        discussionContext: {
          type: 'string',
          description:
            'Optional: paste relevant excerpts from the channel discussion that led to this ticket.',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description:
            'Estimated complexity. small=haiku, medium/large=sonnet, architectural=opus.',
        },
        priority: {
          type: 'number',
          enum: [0, 1, 2, 3, 4],
          description:
            'Priority: 0=no priority, 1=urgent, 2=high, 3=normal, 4=low. Default: 3 (normal).',
        },
      },
      required: ['projectPath', 'title', 'description', 'frictionSummary'],
    },
  },
];
