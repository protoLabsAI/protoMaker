/**
 * twitch_list_suggestions - List Twitch chat suggestions with filtering
 *
 * This tool provides access to the suggestion queue collected from Twitch chat.
 */

import { z } from 'zod';
import { defineSharedTool } from '../../define-tool.js';
import type { ToolResult } from '../../types.js';

/**
 * Input schema for twitch_list_suggestions tool
 */
const ListSuggestionsInputSchema = z.object({
  filter: z
    .enum(['all', 'unprocessed', 'approved'])
    .optional()
    .default('all')
    .describe('Filter suggestions by processing status'),
});

/**
 * Output schema for twitch_list_suggestions tool
 */
const ListSuggestionsOutputSchema = z.object({
  suggestions: z
    .array(
      z.object({
        id: z.string(),
        username: z.string(),
        suggestion: z.string(),
        timestamp: z.string(),
        channel: z.string(),
        processed: z.boolean().optional(),
      })
    )
    .describe('List of suggestions matching the filter'),
  count: z.number().describe('Number of suggestions in the filtered result'),
  total: z.number().describe('Total number of suggestions across all filters'),
  filter: z.string().describe('The filter that was applied'),
});

export type ListSuggestionsInput = z.infer<typeof ListSuggestionsInputSchema>;
export type ListSuggestionsOutput = z.infer<typeof ListSuggestionsOutputSchema>;

/**
 * twitch_list_suggestions - View suggestion queue with filtering
 *
 * Returns suggestions from Twitch chat, optionally filtered by processing status.
 * Use filter='unprocessed' to see only new suggestions that haven't been reviewed.
 */
export const listSuggestions = defineSharedTool({
  name: 'twitch_list_suggestions',
  description:
    'View Twitch chat suggestion queue with filtering. Use filter="unprocessed" to see only new suggestions, "approved" for processed ones, or "all" for everything.',
  inputSchema: ListSuggestionsInputSchema,
  outputSchema: ListSuggestionsOutputSchema,
  metadata: {
    category: 'twitch',
    tags: ['twitch', 'chat', 'suggestions'],
    version: '1.0.0',
  },
  execute: async (input, context): Promise<ToolResult<ListSuggestionsOutput>> => {
    try {
      const typedInput = input as ListSuggestionsInput;

      // Get TwitchService from context
      const twitchService = context.services?.twitchService as any;

      if (!twitchService) {
        return {
          success: false,
          error:
            'TwitchService not available in context. Ensure the service is injected when executing this tool.',
        };
      }

      // Read all suggestions
      const allSuggestions = await twitchService.readSuggestions();

      // Apply filter
      let filteredSuggestions = allSuggestions;
      if (typedInput.filter === 'unprocessed') {
        filteredSuggestions = allSuggestions.filter((s: any) => !s.processed);
      } else if (typedInput.filter === 'approved') {
        filteredSuggestions = allSuggestions.filter((s: any) => s.processed);
      }

      return {
        success: true,
        data: {
          suggestions: filteredSuggestions,
          count: filteredSuggestions.length,
          total: allSuggestions.length,
          filter: typedInput.filter,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to list Twitch suggestions: ${errorMessage}`,
        metadata: {
          originalError: error,
        },
      };
    }
  },
});
