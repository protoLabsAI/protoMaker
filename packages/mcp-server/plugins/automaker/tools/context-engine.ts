/**
 * Context-engine MCP tool definitions — lcm_grep, lcm_describe, lcm_expand.
 *
 * These tools are registered on the AutoMaker MCP server so agents can:
 *
 *   `lcm_grep`    — full-text search across the full message/summary history
 *   `lcm_describe` — inspect a summary node's metadata and provenance chain
 *   `lcm_expand`  — retrieve full original content for a large file or compacted node
 *
 * Each tool hits the corresponding `/api/context-engine/*` HTTP endpoint on the
 * AutoMaker server.  The caller must supply `dbPath` pointing to the SQLite file
 * managed by `ConversationStore`.
 *
 * Tool naming follows the `lcm_` prefix convention established by the context
 * compaction system (`[lcm_expand: <id>]` footers in summaries).
 */

// ---------------------------------------------------------------------------
// lcm_grep
// ---------------------------------------------------------------------------

/**
 * MCP tool definition for `lcm_grep`.
 *
 * Full-text search across the complete conversation history.  Searches:
 *   - Raw message content (`message_parts`) via FTS5 (porter stemmer) or LIKE
 *   - Compacted/condensed summaries (`context_nodes`)
 *   - Large-file interception summaries (`large_files`)
 *
 * Returns a ranked list of matches with ~200-character snippets.
 */
export const LCM_GREP_TOOL = {
  name: 'lcm_grep',
  description:
    'Search the full conversation history for a keyword or phrase. ' +
    'Searches raw message content, compaction summaries, and large-file summaries. ' +
    'Returns ranked snippets so you can locate relevant context before deciding ' +
    'whether to call lcm_expand for the full content. ' +
    'Use FTS5 query syntax for precise matching (e.g. "error AND sqlite", "foo OR bar").',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dbPath: {
        type: 'string',
        description: 'Absolute path to the SQLite database file (conversations.db).',
      },
      query: {
        type: 'string',
        description:
          'Search query. Supports FTS5 syntax (AND, OR, NOT, prefix*, "phrase"). ' +
          'Falls back to LIKE for simple substring matching.',
      },
      conversationId: {
        type: 'string',
        description: 'Optional UUID to restrict the search to a single conversation.',
      },
      limit: {
        type: 'number',
        description: 'Maximum results per source table (default: 10, max: 50).',
      },
      searchNodes: {
        type: 'boolean',
        description: 'Include context_nodes (compacted summaries) in results. Default: true.',
      },
      searchLargeFiles: {
        type: 'boolean',
        description: 'Include large_files summaries in results. Default: true.',
      },
    },
    required: ['dbPath', 'query'],
  },
} as const;

// ---------------------------------------------------------------------------
// lcm_describe
// ---------------------------------------------------------------------------

/**
 * MCP tool definition for `lcm_describe`.
 *
 * Returns metadata for a summary node referenced by an `[lcm_expand: <id>]`
 * footer — its summary text, depth, compaction mode, source IDs, token counts,
 * and optionally the provenance chain (parent nodes that absorbed this node into
 * a higher-depth condensation).
 */
export const LCM_DESCRIBE_TOOL = {
  name: 'lcm_describe',
  description:
    'Show metadata for a compacted summary node. ' +
    'Given a node ID from an [lcm_expand: <id>] reference, returns the summary text, ' +
    'compaction depth (0 = leaf, 1+ = condensed), mode, source IDs, and token counts. ' +
    'Set includeParents=true to see the full provenance chain — which higher-level ' +
    'summaries absorbed this node. ' +
    'Use this before lcm_expand to decide whether you need the full content or ' +
    'the summary is already sufficient.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dbPath: {
        type: 'string',
        description: 'Absolute path to the SQLite database file (conversations.db).',
      },
      nodeId: {
        type: 'string',
        description:
          'UUID of the node to describe. Copy this from an [lcm_expand: "<id>"] footer ' +
          'or from a [LARGE FILE INTERCEPTED] reference.',
      },
      includeParents: {
        type: 'boolean',
        description:
          'Walk UP the DAG and include parent nodes that condensed this node. Default: false.',
      },
      maxParentDepth: {
        type: 'number',
        description: 'Maximum provenance chain levels to return (default: 3).',
      },
    },
    required: ['dbPath', 'nodeId'],
  },
} as const;

// ---------------------------------------------------------------------------
// lcm_expand
// ---------------------------------------------------------------------------

/**
 * MCP tool definition for `lcm_expand`.
 *
 * Retrieves the full original content for a node ID:
 *
 *   - **large_file**: returns the complete intercepted tool result.
 *   - **context_node (depth=0)**: retrieves the original messages that were
 *     compacted into this leaf summary, concatenated in order.
 *   - **context_node (depth≥1)**: recursively walks DOWN the summary DAG to the
 *     leaf messages and returns the assembled content.
 *
 * Bounded by `tokenCap` (default 50 000 tokens) and `ttlMs` (default 10 s)
 * to prevent runaway retrieval.  When either limit is hit, `truncated=true`
 * is returned and a truncation notice is appended.
 */
export const LCM_EXPAND_TOOL = {
  name: 'lcm_expand',
  description:
    'Retrieve the full original content for a compacted summary or intercepted large file. ' +
    'Pass a node ID from an [lcm_expand: "<id>"] footer or a [LARGE FILE INTERCEPTED] block. ' +
    'For large files: returns the full original tool result. ' +
    'For compacted summaries: walks the summary DAG and returns the original messages. ' +
    'Results are bounded by tokenCap to protect the context window — check truncated=true ' +
    'and increase tokenCap if you need more. ' +
    'Optionally provide a question to prepend a focus hint to the returned content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dbPath: {
        type: 'string',
        description: 'Absolute path to the SQLite database file (conversations.db).',
      },
      nodeId: {
        type: 'string',
        description:
          'UUID of the node to expand. Copy from [lcm_expand: "<id>"] or ' +
          '[LARGE FILE INTERCEPTED] File ID references.',
      },
      question: {
        type: 'string',
        description:
          'Optional focused question. When set, a retrieval hint is prepended ' +
          'to the returned content to help orient downstream consumers.',
      },
      tokenCap: {
        type: 'number',
        description:
          'Maximum tokens to return (default: 50 000). Increase if you need more context; ' +
          'decrease to save context window space.',
      },
      ttlMs: {
        type: 'number',
        description:
          'Maximum wall-clock time for the DAG walk in milliseconds (default: 10 000). ' +
          'Increase for deeply nested or large node graphs.',
      },
    },
    required: ['dbPath', 'nodeId'],
  },
} as const;

// ---------------------------------------------------------------------------
// Convenience array (register all three at once)
// ---------------------------------------------------------------------------

/** All three context-engine retrieval tools for bulk registration. */
export const CONTEXT_ENGINE_TOOLS = [LCM_GREP_TOOL, LCM_DESCRIBE_TOOL, LCM_EXPAND_TOOL] as const;
