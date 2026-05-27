/**
 * Knowledge Base Tools (Search, Ingest, Rebuild, Stats)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const knowledgeTools: Tool[] = [
  {
    name: 'knowledge_search',
    description:
      'Search the project knowledge base for relevant documents, code snippets, and documentation. Returns ranked results with relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        query: {
          type: 'string',
          minLength: 1,
          description: 'Search query text',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum results to return (default: 10)',
        },
        filter: {
          type: 'string',
          minLength: 1,
          description: 'Filter by document type (e.g., "code", "docs", "config")',
        },
      },
      required: ['projectPath', 'query'],
    },
  },
  {
    name: 'knowledge_ingest',
    description:
      'Ingest documents into the knowledge base. Supports markdown, text, and code files. Automatically extracts and indexes content.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        filePaths: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Array of file paths to ingest',
        },
        directoryPath: {
          type: 'string',
          minLength: 1,
          description: 'Directory path to ingest all files from (recursive)',
        },
        documentType: {
          type: 'string',
          enum: ['code', 'docs', 'config', 'notes'],
          description: 'Document type classification (optional, auto-detected if not provided)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'knowledge_rebuild',
    description:
      'Rebuild the entire knowledge base index. Use this after major project changes or if search results seem stale.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
        force: {
          type: 'boolean',
          description: 'Force rebuild even if index appears current (default: false)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'knowledge_stats',
    description:
      'Get statistics about the knowledge base: document count, index size, last update time, and search performance metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
];
