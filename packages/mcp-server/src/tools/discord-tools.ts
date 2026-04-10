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
      "Send a message to a project's Discord channel via webhook. " +
      'Requires a project slug (e.g. "protolabsai-protomaker") and a channel type ("dev" or "release"). ' +
      'Webhook URLs are configured in workspace/projects.yaml.',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: {
          type: 'string',
          description: 'Project slug from the registry (e.g. "protolabsai-protomaker", "protolabsai-protoui")',
        },
        channelType: {
          type: 'string',
          enum: ['dev', 'release'],
          description: 'Which project channel to send to: "dev" for development activity, "release" for deployment/release notifications',
        },
        content: {
          type: 'string',
          description: 'Message text (max 2000 characters)',
          maxLength: 2000,
        },
      },
      required: ['projectSlug', 'channelType', 'content'],
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
