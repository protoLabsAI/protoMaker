/**
 * Discord tools — DynamicStructuredTool wrappers for Discord operations.
 *
 * Factory: createDiscordTools(discordBot) returns LangGraph-compatible SharedTool
 * instances for send_message and read_channel.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing concrete Discord.js types
// ---------------------------------------------------------------------------

export interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string };
  timestamp: string;
}

export interface DiscordDeps {
  discordBot: {
    sendMessage: (channelId: string, content: string) => Promise<{ id: string }>;
    readMessages: (channelId: string, options?: { limit?: number }) => Promise<DiscordMessage[]>;
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SendMessageInputSchema = z.object({
  channelId: z.string().describe('Discord channel ID (numeric snowflake string)'),
  content: z.string().max(2000).describe('Message content (max 2000 characters)'),
});

const ReadChannelInputSchema = z.object({
  channelId: z.string().describe('Discord channel ID (numeric snowflake string)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Number of recent messages to fetch (max 100)'),
});

const SendMessageOutputSchema = z.object({
  messageId: z.string().describe('ID of the sent message'),
  channelId: z.string(),
});

const ReadChannelOutputSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      author: z.string().describe('Username of the message author'),
      timestamp: z.string(),
    })
  ),
  count: z.number(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates Discord communication tools bound to the provided discordBot.
 *
 * @param deps - Discord dependencies (discordBot with sendMessage and readMessages)
 * @returns Array of SharedTool instances for use with ToolRegistry or toLangGraphTools()
 */
export function createDiscordTools(deps: DiscordDeps): SharedTool[] {
  const sendMessageTool = defineSharedTool({
    name: 'discord_send_message',
    description:
      'Send a message to a Discord channel. Use the channel ID (numeric snowflake). ' +
      'Returns the ID of the sent message.',
    inputSchema: SendMessageInputSchema,
    outputSchema: SendMessageOutputSchema,
    metadata: { category: 'discord', tags: ['discord', 'message', 'send'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof SendMessageInputSchema>;
      try {
        const result = await deps.discordBot.sendMessage(input.channelId, input.content);
        return {
          success: true,
          data: { messageId: result.id, channelId: input.channelId },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send Discord message',
        };
      }
    },
  });

  const readChannelTool = defineSharedTool({
    name: 'discord_read_channel',
    description:
      'Read recent messages from a Discord channel. Returns messages in reverse-chronological order ' +
      '(newest first). Each message includes author username, content, and timestamp.',
    inputSchema: ReadChannelInputSchema,
    outputSchema: ReadChannelOutputSchema,
    metadata: { category: 'discord', tags: ['discord', 'message', 'read'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ReadChannelInputSchema>;
      try {
        const messages = await deps.discordBot.readMessages(input.channelId, {
          limit: input.limit,
        });
        return {
          success: true,
          data: {
            messages: messages.map((m) => ({
              id: m.id,
              content: m.content,
              author: m.author.username,
              timestamp: m.timestamp,
            })),
            count: messages.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read Discord channel',
        };
      }
    },
  });

  return [sendMessageTool, readChannelTool];
}
