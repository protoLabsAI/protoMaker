/**
 * Knowledge Store Tools
 *
 * Tools for interacting with the Automaker knowledge store:
 * - knowledge_search: Hybrid retrieval with optional domain filter
 * - knowledge_ingest: Add text chunks with required domain tag
 * - knowledge_rebuild: Reindex the knowledge store
 * - knowledge_stats: Get chunk counts by domain
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const knowledgeTools: Tool[] = [
  {
    name: 'knowledge_search',
    description:
      'Search the knowledge store using hybrid retrieval (BM25 + vector). Returns relevant chunks for the given query, optionally filtered by domain.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        query: {
          type: 'string',
          description: 'Search query string',
        },
        domain: {
          type: 'string',
          description: 'Optional domain tag to filter results (e.g. "architecture", "decisions")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20)',
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum total tokens to return (default: 8000)',
        },
      },
      required: ['projectPath', 'query'],
    },
  },
  {
    name: 'knowledge_ingest',
    description:
      'Add a text chunk to the knowledge store with a required domain tag for categorization.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        content: {
          type: 'string',
          description: 'Text content to ingest into the knowledge store',
        },
        domain: {
          type: 'string',
          description:
            'Domain tag to categorize this chunk (e.g. "architecture", "decisions", "bugs")',
        },
        heading: {
          type: 'string',
          description: 'Optional heading or title for the chunk',
        },
      },
      required: ['projectPath', 'content', 'domain'],
    },
  },
  {
    name: 'knowledge_rebuild',
    description:
      'Rebuild the knowledge store FTS5 index. Use after bulk changes to ensure search reflects the latest content.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'knowledge_stats',
    description:
      'Get statistics about the knowledge store, including total chunk counts grouped by domain.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
];
