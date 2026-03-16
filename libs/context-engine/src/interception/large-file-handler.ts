/**
 * LargeFileHandler — intercepts tool results that exceed a token threshold.
 *
 * When a tool result's content exceeds the configured threshold:
 *   1. The full content is stored in the `large_files` table.
 *   2. A compact reference (exploration summary + retrieval instructions)
 *      replaces the original content in the context window.
 *   3. The agent can call `lcm_expand(<fileId>)` to retrieve the full content.
 *
 * Normal-sized results (≤ threshold) pass through unchanged.
 *
 * ## Configuration
 *
 * The token threshold is configurable via `LargeFileInterceptionConfig`.
 * In production, source the config from `WorkflowSettings.largeFileInterception`:
 *
 * ```typescript
 * const handler = new LargeFileHandler(db, {
 *   tokenThreshold: settings.largeFileInterception?.tokenThreshold,
 * });
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * const result = handler.intercept(toolResultContent, partId, conversationId);
 * if (result.intercepted) {
 *   // store result.compactReference in the message part instead
 *   console.log(`Large file stored: ${result.fileId}`);
 * }
 *
 * // Later, agent calls lcm_expand:
 * const fullContent = handler.expand(fileId);
 * ```
 */

import { randomUUID } from 'node:crypto';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';
import { estimateTokens } from '../store/conversation-store.js';

const logger = createLogger('LargeFileHandler');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default token threshold above which content is intercepted (~25 K tokens). */
export const DEFAULT_LARGE_FILE_THRESHOLD = 25_000;

/** Number of lines to include in the exploration summary. */
const SUMMARY_MAX_LINES = 30;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Configuration for the large-file interception layer.
 * In production, source these values from WorkflowSettings.largeFileInterception.
 */
export interface LargeFileInterceptionConfig {
  /**
   * Token count above which a tool result is intercepted and stored.
   * Corresponds to WorkflowSettings.largeFileInterception.tokenThreshold.
   * Defaults to DEFAULT_LARGE_FILE_THRESHOLD (25,000 tokens).
   */
  tokenThreshold?: number;
}

/** A row from the large_files table. */
export interface LargeFileRow {
  id: string;
  /** ID of the message_part this content originated from, if applicable. */
  partId: string | null;
  /** Conversation context for bulk retrieval. */
  conversationId: string | null;
  /** The full, original content that was intercepted. */
  originalContent: string;
  /** Estimated token count of the original content. */
  tokenCount: number;
  /** Compact exploration summary (first SUMMARY_MAX_LINES lines). */
  summary: string;
  /** ISO 8601 timestamp when the content was stored. */
  storedAt: string;
  metadata: Record<string, unknown>;
}

/** Returned when content exceeded the threshold and was intercepted. */
export interface InterceptedResult {
  intercepted: true;
  /** UUID that can be passed to expand() / lcm_expand tool to retrieve the original. */
  fileId: string;
  /**
   * Compact replacement string for the original content.
   * Contains the fileId, original token count, and an exploration summary.
   */
  compactReference: string;
  /** Estimated token count of the original (pre-interception) content. */
  originalTokens: number;
}

/** Returned when content was within the threshold and passed through unchanged. */
export interface PassThroughResult {
  intercepted: false;
  /** Original content, unchanged. */
  content: string;
  /** Estimated token count of the content. */
  tokens: number;
}

/** Union result from intercept(). Discriminated on `intercepted`. */
export type InterceptionResult = InterceptedResult | PassThroughResult;

// ---------------------------------------------------------------------------
// Internal DB row shape
// ---------------------------------------------------------------------------

interface DbLargeFile {
  id: string;
  part_id: string | null;
  conversation_id: string | null;
  original_content: string;
  token_count: number;
  summary: string;
  stored_at: string;
  metadata: string;
}

// ---------------------------------------------------------------------------
// LargeFileHandler
// ---------------------------------------------------------------------------

export class LargeFileHandler {
  private readonly threshold: number;

  /**
   * @param db     An open better-sqlite3 Database instance (must have the
   *               large_files table present — see migration v2).
   * @param config Optional threshold configuration.
   */
  constructor(
    private readonly db: BetterSqlite3.Database,
    config?: LargeFileInterceptionConfig
  ) {
    this.threshold = config?.tokenThreshold ?? DEFAULT_LARGE_FILE_THRESHOLD;
  }

  // ---------------------------------------------------------------------------
  // Core interception
  // ---------------------------------------------------------------------------

  /**
   * Checks whether `content` exceeds the configured token threshold.
   *
   * - If the content is **within** the threshold it is returned unchanged
   *   (`result.intercepted === false`).
   * - If the content **exceeds** the threshold the full text is stored in the
   *   `large_files` table and a compact reference is returned
   *   (`result.intercepted === true`).
   *
   * @param content        Raw content string (e.g. a tool_result block).
   * @param partId         Optional ID of the message_part this content belongs to.
   * @param conversationId Optional conversation context for bulk retrieval.
   */
  intercept(content: string, partId?: string, conversationId?: string): InterceptionResult {
    const tokens = estimateTokens(content);

    if (tokens <= this.threshold) {
      return { intercepted: false, content, tokens };
    }

    // Content exceeds threshold — store full content and return compact ref
    const fileId = randomUUID();
    const summary = this.buildSummary(content);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO large_files
           (id, part_id, conversation_id, original_content, token_count, summary, stored_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(fileId, partId ?? null, conversationId ?? null, content, tokens, summary, now, '{}');

    logger.info(
      `Intercepted large content: fileId=${fileId} tokens=${tokens} threshold=${this.threshold}`
    );

    const compactReference = this.buildCompactReference(fileId, tokens, summary);

    return {
      intercepted: true,
      fileId,
      compactReference,
      originalTokens: tokens,
    };
  }

  // ---------------------------------------------------------------------------
  // Retrieval (lcm_expand)
  // ---------------------------------------------------------------------------

  /**
   * Retrieves the original full content for a previously-intercepted large file.
   *
   * This is the backing implementation for the `lcm_expand` agent tool.
   * The compact reference injected into the context window instructs the agent
   * to call `lcm_expand("<fileId>")` to drill into the full content.
   *
   * @param fileId  The UUID returned by intercept() (visible in the compact reference).
   * @returns The original content string, or `null` if not found.
   */
  expand(fileId: string): string | null {
    const row = this.db
      .prepare('SELECT original_content FROM large_files WHERE id = ?')
      .get(fileId) as { original_content: string } | undefined;

    if (!row) {
      logger.warn(`lcm_expand: no large file found for id=${fileId}`);
      return null;
    }

    logger.debug(`lcm_expand: retrieved fileId=${fileId}`);
    return row.original_content;
  }

  // ---------------------------------------------------------------------------
  // Metadata helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns metadata about an intercepted large file without fetching the
   * full content.  Useful for surfacing context about what was intercepted.
   *
   * @param fileId  UUID of the stored large file.
   */
  getLargeFile(fileId: string): LargeFileRow | null {
    const row = this.db.prepare('SELECT * FROM large_files WHERE id = ?').get(fileId) as
      | DbLargeFile
      | undefined;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Lists all large files stored for a given conversation, ordered by
   * `stored_at` ascending (oldest first).
   *
   * @param conversationId  Conversation to query.
   */
  listForConversation(conversationId: string): LargeFileRow[] {
    const rows = this.db
      .prepare('SELECT * FROM large_files WHERE conversation_id = ? ORDER BY stored_at ASC')
      .all(conversationId) as DbLargeFile[];

    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Deletes a stored large file by ID.
   *
   * @returns `true` if a row was deleted, `false` if not found.
   */
  deleteLargeFile(fileId: string): boolean {
    const result = this.db.prepare('DELETE FROM large_files WHERE id = ?').run(fileId);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a brief exploration summary from the content.
   * Captures the first SUMMARY_MAX_LINES lines so the agent can understand
   * the structure before deciding whether to expand the full content.
   */
  private buildSummary(content: string): string {
    const lines = content.split('\n');
    const preview = lines.slice(0, SUMMARY_MAX_LINES).join('\n');
    const overflow = lines.length - SUMMARY_MAX_LINES;
    return overflow > 0 ? `${preview}\n... (${overflow} more lines)` : preview;
  }

  /**
   * Builds the compact reference string that replaces the original content in
   * the context window.
   *
   * The format is self-documenting so the agent understands:
   *  - Why the content was replaced
   *  - How large the original was
   *  - How to retrieve it (lcm_expand)
   *  - A preview of what the content looks like
   */
  private buildCompactReference(fileId: string, originalTokens: number, summary: string): string {
    return [
      `[LARGE FILE INTERCEPTED]`,
      `File ID: ${fileId}`,
      `Original size: ~${originalTokens.toLocaleString()} tokens (exceeded ${this.threshold.toLocaleString()} token threshold)`,
      `To retrieve full content: lcm_expand("${fileId}")`,
      ``,
      `--- Exploration summary (first ${SUMMARY_MAX_LINES} lines) ---`,
      summary,
      `--- End of summary ---`,
    ].join('\n');
  }

  private mapRow(row: DbLargeFile): LargeFileRow {
    return {
      id: row.id,
      partId: row.part_id,
      conversationId: row.conversation_id,
      originalContent: row.original_content,
      tokenCount: row.token_count,
      summary: row.summary,
      storedAt: row.stored_at,
      metadata: this.parseJson(row.metadata),
    };
  }

  private parseJson(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
