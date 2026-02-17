/**
 * twitch_build_suggestion - Approve a suggestion and create board feature directly
 *
 * This tool skips the poll flow and immediately creates a board feature from a suggestion.
 */

import { z } from 'zod';
import { defineSharedTool } from '../../define-tool.js';
import type { ToolResult } from '../../types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Input schema for twitch_build_suggestion tool
 */
const BuildSuggestionInputSchema = z.object({
  suggestionId: z.string().min(1, 'Suggestion ID is required'),
  projectPath: z.string().min(1, 'Project path is required'),
});

/**
 * Output schema for twitch_build_suggestion tool
 */
const BuildSuggestionOutputSchema = z.object({
  featureId: z.string().describe('ID of the created board feature'),
  featureTitle: z.string().describe('Title of the created feature'),
  suggestionId: z.string().describe('ID of the processed suggestion'),
  username: z.string().describe('Twitch username who made the suggestion'),
  channel: z.string().describe('Twitch channel where suggestion was made'),
});

export type BuildSuggestionInput = z.infer<typeof BuildSuggestionInputSchema>;
export type BuildSuggestionOutput = z.infer<typeof BuildSuggestionOutputSchema>;

/**
 * twitch_build_suggestion - Approve a suggestion and create board feature
 *
 * Takes a suggestion ID and project path, creates a board feature with chat attribution,
 * and marks the suggestion as processed. This skips the poll flow and directly creates
 * the feature.
 */
export const buildSuggestion = defineSharedTool({
  name: 'twitch_build_suggestion',
  description:
    'Approve a Twitch suggestion and create a board feature directly (skip poll). Marks suggestion as processed and creates feature with chat attribution.',
  inputSchema: BuildSuggestionInputSchema,
  outputSchema: BuildSuggestionOutputSchema,
  metadata: {
    category: 'twitch',
    tags: ['twitch', 'chat', 'suggestions', 'features'],
    version: '1.0.0',
  },
  execute: async (input, context): Promise<ToolResult<BuildSuggestionOutput>> => {
    try {
      const typedInput = input as BuildSuggestionInput;

      // Get services from context
      const twitchService = context.services?.twitchService as any;
      const featureLoader = context.services?.featureLoader as any;
      const events = context.services?.events as any;

      if (!twitchService || !featureLoader) {
        return {
          success: false,
          error:
            'Required services (TwitchService, FeatureLoader) not available in context. Ensure services are injected when executing this tool.',
        };
      }

      // Read all suggestions
      const suggestions = await twitchService.readSuggestions();

      // Find the suggestion
      const suggestion = suggestions.find((s: any) => s.id === typedInput.suggestionId);
      if (!suggestion) {
        return {
          success: false,
          error: `Suggestion with ID ${typedInput.suggestionId} not found`,
        };
      }

      // Create board feature
      const featureId = `feature-${Date.now()}-${uuidv4().split('-')[0]}`;
      const feature = {
        id: featureId,
        title: suggestion.suggestion,
        description: `Twitch chat suggestion from @${suggestion.username} in #${suggestion.channel}`,
        status: 'backlog' as const,
        createdAt: new Date().toISOString(),
        metadata: {
          source: 'twitch',
          twitchUsername: suggestion.username,
          twitchChannel: suggestion.channel,
          twitchSuggestionId: suggestion.id,
          twitchTimestamp: suggestion.timestamp,
        },
      };

      await featureLoader.create(typedInput.projectPath, feature);

      // Mark suggestion as processed
      await twitchService.updateSuggestion(typedInput.suggestionId, { processed: true });

      // Emit events if available
      if (events) {
        events.emit('twitch:suggestion:built', {
          suggestionId: typedInput.suggestionId,
          featureId,
          projectPath: typedInput.projectPath,
          timestamp: new Date().toISOString(),
        });

        events.emit('twitch:suggestion:updated', {
          suggestionId: typedInput.suggestionId,
          processed: true,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        success: true,
        data: {
          featureId,
          featureTitle: suggestion.suggestion,
          suggestionId: typedInput.suggestionId,
          username: suggestion.username,
          channel: suggestion.channel,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to build suggestion: ${errorMessage}`,
        metadata: {
          originalError: error,
        },
      };
    }
  },
});
