/**
 * ContextGrep — full-text search across conversation history.
 *
 * Searches three sources in a single call:
 *   1. `message_parts` — raw message content (via FTS5 when indexed, LIKE fallback)
 *   2. `context_nodes` — compacted/condensed summaries
 *   3. `large_files`   — large-file interception summaries
 *
 * FTS5 is used for `message_parts` when the `messages_fts` virtual table has been
 * populated via `ContextFtsIndex.index()`.  For the other two tables LIKE is used
 * directly (they are typically small).
 *
 * Tool: `lcm_grep`
 */

import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('ContextGrep');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GrepOptions {
  /** Search query string. For FTS5: standard FTS5 query syntax (e.g. "foo AND bar"). */
  query: string;
  /** Restrict results to a specific conversation. */
  conversationId?: string;
  /** Maximum results per source table (default: 10). */
  limit?: number;
  /** Include context_nodes in search (default: true). */
  searchNodes?: boolean;
  /** Include large_files in search (default: true). */
  searchLargeFiles?: boolean;
}

export type GrepMatchType = 'message_part' | 'context_node' | 'large_file';

export interface GrepMatch {
  /** Source table this match came from. */
  type: GrepMatchType;
  /** Row ID (part ID, node ID, or large_file ID). */
  id: string;
  /** Message ID — only present for message_part matches. */
  messageId?: string;
  /** Conversation the match belongs to. */
  conversationId?: string;
  /**
   * ~200-character snippet of the matching content, centred on the first
   * occurrence of the query term.
   */
  snippet: string;
  /** Estimated token count of the snippet. */
  tokens: number;
  /**
   * FTS5 rank (lower = more relevant).  0 for LIKE-based matches where
   * relevance ranking is unavailable.
   */
  rank: number;
}

export interface GrepResult {
  matches: GrepMatch[];
  query: string;
  totalMatches: number;
  /** True when FTS5 was used for message_parts; false when LIKE was used. */
  ftsUsed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNIPPET_CHARS = 200;
const SNIPPET_CONTEXT = 60; // chars before the match

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSnippet(content: string, queryFirstWord: string): string {
  const lower = content.toLowerCase();
  const wordLower = queryFirstWord.toLowerCase();
  const idx = lower.indexOf(wordLower);

  if (idx === -1) {
    return content.slice(0, SNIPPET_CHARS);
  }

  const start = Math.max(0, idx - SNIPPET_CONTEXT);
  const end = Math.min(content.length, start + SNIPPET_CHARS);
  const text = content.slice(start, end);
  return start > 0 ? `\u2026${text}` : text;
}

function estimateSnippetTokens(snippet: string): number {
  return Math.ceil(snippet.length / 4);
}

// ---------------------------------------------------------------------------
// ContextFtsIndex — helper for populating the messages_fts virtual table
// ---------------------------------------------------------------------------

/**
 * Manages the FTS5 index for message_parts content.
 *
 * Call `index(conversationId)` after inserting messages to keep the FTS5
 * virtual table up to date.  Already-indexed parts are skipped via a
 * NOT EXISTS check so the call is idempotent.
 */
export class ContextFtsIndex {
  constructor(private readonly db: BetterSqlite3.Database) {}

  /**
   * Index all message_parts for a conversation that are not yet in messages_fts.
   *
   * @returns Number of parts newly indexed.
   */
  index(conversationId: string): number {
    const rows = this.db
      .prepare(
        `SELECT mp.id AS part_id, mp.message_id, m.conversation_id, mp.content
         FROM message_parts mp
         JOIN messages m ON mp.message_id = m.id
         WHERE m.conversation_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM messages_fts WHERE part_id = mp.id
           )`
      )
      .all(conversationId) as Array<{
      part_id: string;
      message_id: string;
      conversation_id: string;
      content: string;
    }>;

    if (rows.length === 0) return 0;

    const insert = this.db.prepare(
      'INSERT INTO messages_fts (part_id, message_id, conversation_id, content) VALUES (?, ?, ?, ?)'
    );

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        insert.run(row.part_id, row.message_id, row.conversation_id, row.content);
      }
    });
    tx();

    logger.debug(`ContextFtsIndex: indexed ${rows.length} parts for conversation=${conversationId}`);
    return rows.length;
  }

  /**
   * Remove all FTS5 entries for a conversation (e.g. when a conversation is deleted).
   */
  removeConversation(conversationId: string): void {
    this.db
      .prepare("DELETE FROM messages_fts WHERE conversation_id = ?")
      .run(conversationId);
  }

  /**
   * Rebuild the entire FTS5 index from scratch.
   * Useful after bulk imports or schema repairs.
   */
  rebuild(): number {
    this.db.prepare("DELETE FROM messages_fts").run();

    const rows = this.db
      .prepare(
        `SELECT mp.id AS part_id, mp.message_id, m.conversation_id, mp.content
         FROM message_parts mp
         JOIN messages m ON mp.message_id = m.id`
      )
      .all() as Array<{
      part_id: string;
      message_id: string;
      conversation_id: string;
      content: string;
    }>;

    if (rows.length === 0) return 0;

    const insert = this.db.prepare(
      'INSERT INTO messages_fts (part_id, message_id, conversation_id, content) VALUES (?, ?, ?, ?)'
    );

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        insert.run(row.part_id, row.message_id, row.conversation_id, row.content);
      }
    });
    tx();

    logger.info(`ContextFtsIndex: rebuilt index with ${rows.length} parts`);
    return rows.length;
  }
}

// ---------------------------------------------------------------------------
// ContextGrep
// ---------------------------------------------------------------------------

export class ContextGrep {
  constructor(private readonly db: BetterSqlite3.Database) {}

  /**
   * Search conversation history for `options.query`.
   *
   * Results are drawn from `message_parts` (via FTS5 or LIKE), `context_nodes`,
   * and `large_files`, each capped at `options.limit` matches.
   */
  search(options: GrepOptions): GrepResult {
    const { query, conversationId, limit = 10 } = options;
    const searchNodes = options.searchNodes !== false;
    const searchLargeFiles = options.searchLargeFiles !== false;

    const queryFirstWord = query.split(/\s+/)[0] ?? query;
    const matches: GrepMatch[] = [];
    let ftsUsed = false;

    // ── 1. message_parts (FTS5 preferred, LIKE fallback) ──────────────────
    const ftsMatches = this.searchMessagesFts(query, conversationId, limit, queryFirstWord);
    if (ftsMatches !== null) {
      matches.push(...ftsMatches);
      ftsUsed = true;
    } else {
      matches.push(...this.searchMessagesParts(query, conversationId, limit, queryFirstWord));
    }

    // ── 2. context_nodes ──────────────────────────────────────────────────
    if (searchNodes) {
      matches.push(...this.searchContextNodes(query, conversationId, limit, queryFirstWord));
    }

    // ── 3. large_files ────────────────────────────────────────────────────
    if (searchLargeFiles) {
      matches.push(...this.searchLargeFiles(query, conversationId, limit, queryFirstWord));
    }

    logger.debug(
      `lcm_grep: query="${query}" fts=${ftsUsed} → ${matches.length} matches`
    );

    return { matches, query, totalMatches: matches.length, ftsUsed };
  }

  // ---------------------------------------------------------------------------
  // Private: per-source search methods
  // ---------------------------------------------------------------------------

  /**
   * FTS5 search of `messages_fts`.
   * Returns null if the FTS table is empty (triggers LIKE fallback).
   */
  private searchMessagesFts(
    query: string,
    conversationId: string | undefined,
    limit: number,
    queryFirstWord: string
  ): GrepMatch[] | null {
    try {
      // Check if FTS table has any rows before using it
      const count = this.db
        .prepare('SELECT COUNT(*) AS n FROM messages_fts')
        .get() as { n: number };

      if (count.n === 0) return null;

      let sql: string;
      let params: unknown[];

      if (conversationId) {
        sql = `
          SELECT part_id, message_id, conversation_id, content, rank
          FROM messages_fts
          WHERE messages_fts MATCH ?
            AND conversation_id = ?
          ORDER BY rank
          LIMIT ?
        `;
        params = [query, conversationId, limit];
      } else {
        sql = `
          SELECT part_id, message_id, conversation_id, content, rank
          FROM messages_fts
          WHERE messages_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `;
        params = [query, limit];
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        part_id: string;
        message_id: string;
        conversation_id: string;
        content: string;
        rank: number;
      }>;

      return rows.map((row) => {
        const s = buildSnippet(row.content, queryFirstWord);
        return {
          type: 'message_part' as const,
          id: row.part_id,
          messageId: row.message_id,
          conversationId: row.conversation_id,
          snippet: s,
          tokens: estimateSnippetTokens(s),
          rank: row.rank,
        };
      });
    } catch (err) {
      logger.warn(`FTS5 search failed (${(err as Error).message}); falling back to LIKE`);
      return null;
    }
  }

  /** LIKE-based fallback search of `message_parts`. */
  private searchMessagesParts(
    query: string,
    conversationId: string | undefined,
    limit: number,
    queryFirstWord: string
  ): GrepMatch[] {
    const likeQuery = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

    try {
      let sql: string;
      let params: unknown[];

      if (conversationId) {
        sql = `
          SELECT mp.id, mp.message_id, mp.content, m.conversation_id
          FROM message_parts mp
          JOIN messages m ON mp.message_id = m.id
          WHERE mp.content LIKE ? ESCAPE '\\'
            AND m.conversation_id = ?
          LIMIT ?
        `;
        params = [likeQuery, conversationId, limit];
      } else {
        sql = `
          SELECT mp.id, mp.message_id, mp.content, m.conversation_id
          FROM message_parts mp
          JOIN messages m ON mp.message_id = m.id
          WHERE mp.content LIKE ? ESCAPE '\\'
          LIMIT ?
        `;
        params = [likeQuery, limit];
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        message_id: string;
        content: string;
        conversation_id: string;
      }>;

      return rows.map((row) => {
        const s = buildSnippet(row.content, queryFirstWord);
        return {
          type: 'message_part' as const,
          id: row.id,
          messageId: row.message_id,
          conversationId: row.conversation_id,
          snippet: s,
          tokens: estimateSnippetTokens(s),
          rank: 0,
        };
      });
    } catch (err) {
      logger.warn(`message_parts LIKE search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private searchContextNodes(
    query: string,
    conversationId: string | undefined,
    limit: number,
    queryFirstWord: string
  ): GrepMatch[] {
    const likeQuery = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

    try {
      let sql: string;
      let params: unknown[];

      if (conversationId) {
        sql = `
          SELECT id, conversation_id, summary
          FROM context_nodes
          WHERE summary LIKE ? ESCAPE '\\'
            AND conversation_id = ?
          LIMIT ?
        `;
        params = [likeQuery, conversationId, limit];
      } else {
        sql = `
          SELECT id, conversation_id, summary
          FROM context_nodes
          WHERE summary LIKE ? ESCAPE '\\'
          LIMIT ?
        `;
        params = [likeQuery, limit];
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        conversation_id: string | null;
        summary: string;
      }>;

      return rows.map((row) => {
        const s = buildSnippet(row.summary, queryFirstWord);
        return {
          type: 'context_node' as const,
          id: row.id,
          conversationId: row.conversation_id ?? undefined,
          snippet: s,
          tokens: estimateSnippetTokens(s),
          rank: 0,
        };
      });
    } catch (err) {
      logger.warn(`context_nodes search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private searchLargeFiles(
    query: string,
    conversationId: string | undefined,
    limit: number,
    queryFirstWord: string
  ): GrepMatch[] {
    const likeQuery = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

    try {
      let sql: string;
      let params: unknown[];

      if (conversationId) {
        sql = `
          SELECT id, conversation_id, summary
          FROM large_files
          WHERE summary LIKE ? ESCAPE '\\'
            AND conversation_id = ?
          LIMIT ?
        `;
        params = [likeQuery, conversationId, limit];
      } else {
        sql = `
          SELECT id, conversation_id, summary
          FROM large_files
          WHERE summary LIKE ? ESCAPE '\\'
          LIMIT ?
        `;
        params = [likeQuery, limit];
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        conversation_id: string | null;
        summary: string;
      }>;

      return rows.map((row) => {
        const s = buildSnippet(row.summary, queryFirstWord);
        return {
          type: 'large_file' as const,
          id: row.id,
          conversationId: row.conversation_id ?? undefined,
          snippet: s,
          tokens: estimateSnippetTokens(s),
          rank: 0,
        };
      });
    } catch (err) {
      logger.warn(`large_files search failed: ${(err as Error).message}`);
      return [];
    }
  }
}
