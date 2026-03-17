/**
 * Discord Channel Tools
 *
 * MCP tools for sending and reading Discord channel messages.
 * Accepts either a raw channel ID or a human-readable channel name (resolved
 * to ID via the known-channel map or environment variables).
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const discordTools: Tool[] = [
  {
    name: 'send_channel_message',
    description:
      'Send a message to a Discord channel. Accepts a channel name (e.g. "ava", "dev", "infra") or a raw channel ID. ' +
      'Returns an error if the Discord bot is not connected.',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Raw Discord channel ID (18-19 digit snowflake)',
        },
        channelName: {
          type: 'string',
          description:
            'Human-readable channel name (e.g. "ava", "dev", "infra", "alerts", "deployments", "bug-reports", "vip-lounge"). Used when channelId is not provided.',
        },
        content: {
          type: 'string',
          description: 'Message text (max 2000 characters)',
          maxLength: 2000,
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'read_channel_messages',
    description:
      'Read recent messages from a Discord channel. Accepts a channel name or raw channel ID. ' +
      'Returns an error if the Discord bot is not connected.',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Raw Discord channel ID (18-19 digit snowflake)',
        },
        channelName: {
          type: 'string',
          description:
            'Human-readable channel name (e.g. "ava", "dev", "infra"). Used when channelId is not provided.',
        },
        limit: {
          type: 'number',
          description: 'Number of messages to return (default: 20, max: 100)',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: 'add_reaction',
    description:
      'Add an emoji reaction to a Discord message. Accepts a channel name or raw channel ID. ' +
      'Returns an error if the Discord bot is not connected.',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Raw Discord channel ID (18-19 digit snowflake)',
        },
        channelName: {
          type: 'string',
          description:
            'Human-readable channel name (e.g. "ava", "dev", "infra"). Used when channelId is not provided.',
        },
        messageId: {
          type: 'string',
          description: 'Discord message ID to react to',
        },
        emoji: {
          type: 'string',
          description: 'Emoji to react with (e.g. "👍", "✅", or a custom emoji name like "heart")',
        },
      },
      required: ['messageId', 'emoji'],
    },
  },
];
