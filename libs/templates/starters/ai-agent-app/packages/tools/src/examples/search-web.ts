/**
 * Example tool: search_web
 *
 * Demonstrates the define-once-deploy-everywhere pattern with a more complex
 * input schema including optional parameters and array output.
 * Works as an MCP tool, LangGraph tool, or Express route without modification.
 */

import { z } from 'zod';
import { defineSharedTool } from '../define-tool.js';

const SearchWebInput = z.object({
  query: z.string().min(1).describe('The search query string'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Maximum number of results to return (1–20)'),
  language: z
    .string()
    .optional()
    .default('en')
    .describe('BCP-47 language code for results (e.g. "en", "fr", "de")'),
});

const SearchResult = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().describe('A short excerpt from the page'),
});

const SearchWebOutput = z.object({
  query: z.string(),
  results: z.array(SearchResult),
  totalResults: z.number().describe('Estimated total number of results (may be approximate)'),
});

/**
 * search_web — perform a web search and return a list of results.
 *
 * The context object may carry a `searchApiKey` and `searchEngineId` to
 * authenticate against a real search API (e.g. Google Custom Search).
 * This example returns deterministic mock data so it works without credentials.
 */
export const searchWebTool = defineSharedTool({
  name: 'search_web',
  description:
    'Search the web for information on a given query and return the top results with titles, URLs, and snippets.',
  inputSchema: SearchWebInput,
  outputSchema: SearchWebOutput,
  metadata: {
    category: 'research',
    tags: ['search', 'web', 'external-api'],
    version: '1.0.0',
  },
  execute: async (input, context) => {
    // Replace this stub with a real search API call, e.g. Google Custom Search:
    //
    //   const apiKey = context.searchApiKey as string;
    //   const cx = context.searchEngineId as string;
    //   const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(input.query)}&num=${input.maxResults}&lr=lang_${input.language}`;
    //   const response = await fetch(url);
    //   const data = await response.json();
    //
    void context;

    const maxResults = input.maxResults ?? 5;

    // Mock results — deterministic for demo/testing
    const results = Array.from({ length: Math.min(maxResults, 3) }, (_, i) => ({
      title: `Result ${i + 1} for "${input.query}"`,
      url: `https://example.com/result-${i + 1}?q=${encodeURIComponent(input.query)}`,
      snippet: `This is a sample result snippet for "${input.query}". Replace this stub with a real search API call.`,
    }));

    return {
      success: true,
      data: {
        query: input.query,
        results,
        totalResults: 1_000_000,
      },
    };
  },
});
