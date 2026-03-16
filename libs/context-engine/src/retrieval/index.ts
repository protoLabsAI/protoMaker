/**
 * Retrieval tools for context-engine.
 *
 * Exports the three agent retrieval tools (`lcm_grep`, `lcm_describe`, `lcm_expand`)
 * and supporting classes (`ContextNodeStore`, `ContextFtsIndex`).
 *
 * ## Quick reference
 *
 * | Export              | Tool         | Description                                            |
 * |---------------------|--------------|--------------------------------------------------------|
 * | `ContextGrep`       | `lcm_grep`   | Full-text search across message history                |
 * | `ContextFtsIndex`   | —            | FTS5 index management (populate/rebuild messages_fts)  |
 * | `ContextDescriber`  | `lcm_describe` | Summary metadata + provenance chain                  |
 * | `ContextExpander`   | `lcm_expand` | Bounded DAG walk — retrieve original content           |
 * | `ContextNodeStore`  | —            | Persist CompactedNode / CondensedNode to context_nodes |
 */

export * from './grep.js';
export * from './describe.js';
export * from './expand.js';
