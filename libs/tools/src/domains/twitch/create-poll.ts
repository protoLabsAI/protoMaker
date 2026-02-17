/**
 * twitch_create_poll - Create a native Twitch poll from selected suggestions
 *
 * This tool takes 2-4 suggestion IDs, creates a native Twitch poll via Helix API,
 * listens for the poll result, and auto-creates a board feature from the winning suggestion.
 */

import { z } from 'zod';
import { defineSharedTool } from '../../define-tool.js';
import type { ToolResult } from '../../types.js';

/**
 * Input schema for twitch_create_poll tool
 */
const CreatePollInputSchema = z.object({
  suggestionIds: z
    .array(z.string())
    .min(2, 'At least 2 suggestions required')
    .max(4, 'Maximum 4 suggestions allowed')
    .describe('Array of 2-4 suggestion IDs to include in the poll'),
  projectPath: z.string().min(1, 'Project path is required'),
  durationSeconds: z
    .number()
    .int()
    .min(15)
    .max(1800)
    .optional()
    .default(60)
    .describe('Poll duration in seconds (15-1800, default: 60)'),
});

/**
 * Output schema for twitch_create_poll tool
 */
const CreatePollOutputSchema = z.object({
  pollId: z.string().describe('ID of the created Twitch poll'),
  title: z.string().describe('Title of the poll'),
  choices: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      })
    )
    .describe('Poll choices (suggestions)'),
  durationSeconds: z.number().describe('Poll duration in seconds'),
  status: z.string().describe('Poll status'),
  message: z.string().describe('Additional information about the poll'),
});

export type CreatePollInput = z.infer<typeof CreatePollInputSchema>;
export type CreatePollOutput = z.infer<typeof CreatePollOutputSchema>;

/**
 * twitch_create_poll - Create native Twitch poll from suggestions
 *
 * Takes 2-4 suggestion IDs and creates a native Twitch poll via Helix API.
 * When the poll ends, the winning suggestion automatically creates a board feature.
 * Requires TWITCH_CLIENT_ID and TWITCH_ACCESS_TOKEN environment variables.
 */
export const createPoll = defineSharedTool({
  name: 'twitch_create_poll',
  description:
    'Create a native Twitch poll from 2-4 selected suggestions. When poll ends, winning suggestion auto-creates a board feature. Requires Twitch API credentials.',
  inputSchema: CreatePollInputSchema,
  outputSchema: CreatePollOutputSchema,
  metadata: {
    category: 'twitch',
    tags: ['twitch', 'poll', 'suggestions', 'features'],
    version: '1.0.0',
  },
  execute: async (input, context): Promise<ToolResult<CreatePollOutput>> => {
    try {
      const typedInput = input as CreatePollInput;

      // Get services from context
      const twitchService = context.services?.twitchService as any;
      const events = context.services?.events as any;

      if (!twitchService) {
        return {
          success: false,
          error:
            'TwitchService not available in context. Ensure the service is injected when executing this tool.',
        };
      }

      // Read all suggestions
      const allSuggestions = await twitchService.readSuggestions();

      // Find the suggestions
      const suggestions = typedInput.suggestionIds
        .map((id) => allSuggestions.find((s: any) => s.id === id))
        .filter((s: any) => s !== undefined);

      if (suggestions.length !== typedInput.suggestionIds.length) {
        return {
          success: false,
          error: 'One or more suggestions not found',
        };
      }

      // Create Twitch poll via Helix API
      const pollResult = await twitchService.createPoll({
        title: 'Which feature should we build?',
        choices: suggestions.map((s: any) => ({
          title: s.suggestion.substring(0, 25), // Twitch poll choice max length
        })),
        durationSeconds: typedInput.durationSeconds || 60,
      });

      // Store poll metadata for result tracking
      await twitchService.storePollMetadata(pollResult.id, {
        suggestionIds: typedInput.suggestionIds,
        projectPath: typedInput.projectPath,
        pollId: pollResult.id,
        createdAt: new Date().toISOString(),
        status: 'active',
      });

      // Emit event if available
      if (events) {
        events.emit('twitch:poll:created', {
          pollId: pollResult.id,
          suggestionIds: typedInput.suggestionIds,
          projectPath: typedInput.projectPath,
          duration: typedInput.durationSeconds || 60,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        success: true,
        data: {
          pollId: pollResult.id,
          title: pollResult.title,
          choices: pollResult.choices,
          durationSeconds: pollResult.durationSeconds,
          status: pollResult.status,
          message: `Twitch poll created successfully. Poll ID: ${pollResult.id}. When the poll ends, the winning suggestion will automatically create a board feature.`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to create Twitch poll: ${errorMessage}`,
        metadata: {
          originalError: error,
        },
      };
    }
  },
});
