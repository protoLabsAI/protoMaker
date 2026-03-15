/**
 * Example: search_web tool
 *
 * Demonstrates the defineSharedTool pattern with async execution and
 * array-typed output. Uses a mock implementation — replace the execute
 * body with a real search API call (e.g. Brave Search, Tavily, SerpAPI).
 *
 * @example Replace with real API:
 * ```typescript
 * const response = await fetch(
 *   `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(input.query)}&count=${input.limit}`,
 *   { headers: { 'X-Subscription-Token': context.config?.apiKey as string } }
 * );
 * const data = await response.json();
 * ```
 */

import { z } from 'zod';
import { defineSharedTool } from '../core/defineSharedTool.js';

export const search_web = defineSharedTool({
  name: 'search_web',
  description:
    'Search the web for information on a topic. Returns a list of relevant results with titles, URLs, and snippets.',

  inputSchema: z.object({
    query: z.string().min(1).describe('The search query'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Maximum number of results to return (1–10, default: 5)'),
  }),

  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        snippet: z.string().describe('A short excerpt from the page'),
      })
    ),
    totalResults: z.number().describe('Total number of results returned'),
    query: z.string().describe('The search query that was executed'),
  }),

  execute: async (input) => {
    // Mock implementation — replace with real search API call
    const limit = input.limit;

    const results = Array.from({ length: limit }, (_, i) => ({
      title: `Result ${i + 1}: ${input.query} — Example Page`,
      url: `https://example.com/search/${encodeURIComponent(input.query)}/${i + 1}`,
      snippet: `This is a mock search result for "${input.query}". Replace this implementation with a real search API to get actual results.`,
    }));

    return {
      success: true,
      data: {
        results,
        totalResults: results.length,
        query: input.query,
      },
    };
  },

  metadata: {
    category: 'search',
    tags: ['search', 'web', 'example'],
    version: '1.0.0',
  },
});
