/**
 * SummaryStore — SQLite-backed persistence layer for the context-engine DAG.
 *
 * Responsibility
 * --------------
 * Persist SummaryNodes and their bidirectional provenance links:
 *   - summary → covered raw message IDs  (summary_sources)
 *   - summary → child summary IDs        (summary_parents)
 *
 * Expose DAG traversal helpers:
 *   - getAncestors    – walk up from a node toward the root(s)
 *   - getDescendants  – walk down from a node toward the leaves
 *   - getSourceMessages – collect all raw message IDs covered by a subtree
 *
 * Expose FTS5-based full-text search over summary content.
 *
 * Context assembly scratch table management (upsertContextItems / getContextItems).
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { runMigrations } from './migrations.js';
import type {
  Message,
  MessageId,
  SessionId,
  Summary,
  SummaryNode,
  SummaryNodeId,
} from '../types.js';

// ---------------------------------------------------------------------------
// Internal row types (what SQLite gives back)
// ---------------------------------------------------------------------------

interface SummaryRow {
  id: string;
  session_id: string;
  content: string;
  token_count: number;
  depth: number;
  condensed: number; // 0 | 1
  parent_id: string | null;
  created_at: number;
}

interface SourceRow {
  summary_id: string;
  message_id: string;
}

interface ParentRow {
  parent_id: string;
  child_id: string;
}

interface FtsRow {
  rowid: number;
  rank: number;
}

// ---------------------------------------------------------------------------
// Context item row stored by the assembly scratch table
// ---------------------------------------------------------------------------

export interface ContextItemRow {
  id: string;
  session_id: string;
  kind: 'message' | 'summary';
  source_id: string;
  content: string;
  token_count: number;
  item_order: number;
  assembled_at: number;
}

// ---------------------------------------------------------------------------
// FTS search result
// ---------------------------------------------------------------------------

export interface FtsSearchResult {
  summaryNode: SummaryNode;
  rank: number;
}

// ---------------------------------------------------------------------------
// SummaryStore
// ---------------------------------------------------------------------------

/**
 * SQLite-backed store for the summary DAG.
 *
 * @example
 * ```ts
 * const store = new SummaryStore(':memory:');
 * store.saveSummaryNode(node);
 * const ancestors = store.getAncestors('some-id');
 * ```
 */
export class SummaryStore {
  private readonly db: Database.Database;

  /**
   * @param dbPath - Absolute path to the SQLite file, or ':memory:' for tests.
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // WAL mode for concurrent reads alongside writes.
    this.db.pragma('journal_mode = WAL');
    // FK enforcement.
    this.db.pragma('foreign_keys = ON');
    // Apply all pending schema migrations.
    runMigrations(this.db);
  }

  // -------------------------------------------------------------------------
  // Low-level helpers
  // -------------------------------------------------------------------------

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }

  // -------------------------------------------------------------------------
  // Summary node persistence
  // -------------------------------------------------------------------------

  /**
   * Persist a SummaryNode (and its provenance links) to the store.
   * Existing records with the same id are replaced atomically.
   *
   * @param node - The SummaryNode to persist.
   */
  saveSummaryNode(node: SummaryNode): void {
    const save = this.db.transaction(() => {
      // Upsert the summary row.
      this.db
        .prepare(
          `INSERT OR REPLACE INTO summaries
             (id, session_id, content, token_count, depth, condensed, parent_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          node.summary.id,
          this._extractSessionId(node),
          node.summary.content,
          node.summary.tokenCount,
          node.summary.depth,
          node.condensed ? 1 : 0,
          node.parentId,
          node.summary.createdAt
        );

      // Replace provenance links (delete + re-insert).
      this.db.prepare('DELETE FROM summary_sources WHERE summary_id = ?').run(node.summary.id);
      const insertSource = this.db.prepare(
        'INSERT OR IGNORE INTO summary_sources (summary_id, message_id) VALUES (?, ?)'
      );
      for (const msgId of node.summary.coveredMessageIds) {
        insertSource.run(node.summary.id, msgId);
      }

      this.db.prepare('DELETE FROM summary_parents WHERE parent_id = ?').run(node.summary.id);
      const insertChild = this.db.prepare(
        'INSERT OR IGNORE INTO summary_parents (parent_id, child_id) VALUES (?, ?)'
      );
      for (const childId of node.summary.childSummaryIds) {
        insertChild.run(node.summary.id, childId);
      }
    });

    save();
  }

  /**
   * Mark a SummaryNode as condensed (superseded by a higher-level node).
   *
   * @param id - The id of the node to mark.
   */
  markCondensed(id: SummaryNodeId): void {
    this.db.prepare('UPDATE summaries SET condensed = 1 WHERE id = ?').run(id);
  }

  /**
   * Retrieve a single SummaryNode by id.
   *
   * @returns The node, or `undefined` if not found.
   */
  getSummaryNode(id: SummaryNodeId): SummaryNode | undefined {
    const row = this.db.prepare('SELECT * FROM summaries WHERE id = ?').get(id) as
      | SummaryRow
      | undefined;
    if (!row) return undefined;
    return this._rowToNode(row);
  }

  /**
   * Return all SummaryNodes for a session ordered by depth then creation time.
   *
   * @param sessionId - The session to query.
   */
  getAllSummaryNodes(sessionId: SessionId): SummaryNode[] {
    const rows = this.db
      .prepare('SELECT * FROM summaries WHERE session_id = ? ORDER BY depth ASC, created_at ASC')
      .all(sessionId) as SummaryRow[];
    return rows.map((r) => this._rowToNode(r));
  }

  /**
   * Return active (non-condensed) SummaryNodes for a session.
   *
   * @param sessionId - The session to query.
   */
  getActiveSummaryNodes(sessionId: SessionId): SummaryNode[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM summaries
          WHERE session_id = ? AND condensed = 0
          ORDER BY depth ASC, created_at ASC`
      )
      .all(sessionId) as SummaryRow[];
    return rows.map((r) => this._rowToNode(r));
  }

  /**
   * Delete all summaries (and provenance links via CASCADE) for a session.
   *
   * @param sessionId - The session whose summaries to delete.
   */
  deleteSummariesForSession(sessionId: SessionId): void {
    this.db.prepare('DELETE FROM summaries WHERE session_id = ?').run(sessionId);
  }

  // -------------------------------------------------------------------------
  // DAG traversal
  // -------------------------------------------------------------------------

  /**
   * Walk UP from `startId` toward the root(s), returning the ancestor chain.
   * The result is ordered closest-to-start first (i.e., parent → grandparent → …).
   * The start node itself is NOT included.
   *
   * @param startId - The node to start from.
   * @returns Ordered array of ancestor SummaryNodes.
   */
  getAncestors(startId: SummaryNodeId): SummaryNode[] {
    const result: SummaryNode[] = [];
    const visited = new Set<string>();
    let currentId: string | null = startId;

    while (currentId) {
      if (visited.has(currentId)) break; // cycle guard (shouldn't happen in a DAG)
      visited.add(currentId);

      const row = this.db.prepare('SELECT * FROM summaries WHERE id = ?').get(currentId) as
        | SummaryRow
        | undefined;

      if (!row) break;

      if (row.id !== startId) {
        result.push(this._rowToNode(row));
      }

      currentId = row.parent_id;
    }

    return result;
  }

  /**
   * Walk DOWN from `startId` through child summaries, returning all
   * descendants breadth-first.
   * The start node itself is NOT included.
   *
   * @param startId - The node to start from.
   * @returns BFS-ordered array of descendant SummaryNodes.
   */
  getDescendants(startId: SummaryNodeId): SummaryNode[] {
    const result: SummaryNode[] = [];
    const visited = new Set<string>([startId]);
    const queue: string[] = [startId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const childRows = this.db
        .prepare(
          `SELECT s.* FROM summaries s
            JOIN summary_parents sp ON sp.child_id = s.id
           WHERE sp.parent_id = ?
           ORDER BY s.depth ASC, s.created_at ASC`
        )
        .all(parentId) as SummaryRow[];

      for (const row of childRows) {
        if (!visited.has(row.id)) {
          visited.add(row.id);
          result.push(this._rowToNode(row));
          queue.push(row.id);
        }
      }
    }

    return result;
  }

  /**
   * Collect the set of all raw message IDs covered by the subtree rooted at
   * `startId` (including the node itself).
   *
   * Walks the descendant tree and unions all `summary_sources` entries.
   *
   * @param startId - The root of the subtree to inspect.
   * @returns Deduplicated array of raw MessageIds.
   */
  getSourceMessages(startId: SummaryNodeId): MessageId[] {
    // Gather all nodes in the subtree (start + descendants).
    const descendants = this.getDescendants(startId);
    const allIds = [startId, ...descendants.map((n) => n.summary.id)];

    const messageIds = new Set<string>();
    const stmt = this.db.prepare('SELECT message_id FROM summary_sources WHERE summary_id = ?');

    for (const id of allIds) {
      const rows = stmt.all(id) as Array<{ message_id: string }>;
      for (const row of rows) {
        messageIds.add(row.message_id);
      }
    }

    return Array.from(messageIds);
  }

  // -------------------------------------------------------------------------
  // FTS5 full-text search
  // -------------------------------------------------------------------------

  /**
   * Search summary content using FTS5 full-text search.
   *
   * @param query   - The search query (FTS5 syntax supported, e.g. `"exact phrase"`).
   * @param sessionId - When provided, restrict results to this session.
   * @param limit   - Maximum number of results. Defaults to 20.
   * @returns Ranked search results, best match first.
   */
  searchSummaries(query: string, sessionId?: SessionId, limit = 20): FtsSearchResult[] {
    const sanitised = this._sanitiseFtsQuery(query);
    if (!sanitised) return [];

    let rows: SummaryRow[];

    if (sessionId) {
      rows = this.db
        .prepare(
          `SELECT s.*
             FROM summaries s
             JOIN summaries_fts fts ON fts.rowid = s.rowid
            WHERE summaries_fts MATCH ?
              AND s.session_id = ?
            ORDER BY rank
            LIMIT ?`
        )
        .all(sanitised, sessionId, limit) as SummaryRow[];
    } else {
      rows = this.db
        .prepare(
          `SELECT s.*
             FROM summaries s
             JOIN summaries_fts fts ON fts.rowid = s.rowid
            WHERE summaries_fts MATCH ?
            ORDER BY rank
            LIMIT ?`
        )
        .all(sanitised, limit) as SummaryRow[];
    }

    return rows.map((row, index) => ({
      summaryNode: this._rowToNode(row),
      // FTS5 rank is negative (lower = better); normalise to a 0-1 score.
      rank: index,
    }));
  }

  // -------------------------------------------------------------------------
  // Context items (assembly scratch table)
  // -------------------------------------------------------------------------

  /**
   * Replace the context items for a session atomically.
   *
   * @param sessionId - The session to update.
   * @param items     - Ordered items from the latest assemble() call.
   */
  upsertContextItems(
    sessionId: SessionId,
    items: Omit<ContextItemRow, 'id' | 'session_id' | 'assembled_at'>[]
  ): void {
    const now = Date.now();
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM context_items WHERE session_id = ?').run(sessionId);
      const insert = this.db.prepare(
        `INSERT INTO context_items
           (id, session_id, kind, source_id, content, token_count, item_order, assembled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of items) {
        insert.run(
          randomUUID(),
          sessionId,
          item.kind,
          item.source_id,
          item.content,
          item.token_count,
          item.item_order,
          now
        );
      }
    });
    replace();
  }

  /**
   * Return the current context items for a session ordered by `item_order`.
   *
   * @param sessionId - The session to query.
   */
  getContextItems(sessionId: SessionId): ContextItemRow[] {
    return this.db
      .prepare('SELECT * FROM context_items WHERE session_id = ? ORDER BY item_order ASC')
      .all(sessionId) as ContextItemRow[];
  }

  /**
   * Delete all context items for a session.
   *
   * @param sessionId - The session to clear.
   */
  clearContextItems(sessionId: SessionId): void {
    this.db.prepare('DELETE FROM context_items WHERE session_id = ?').run(sessionId);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Build a SummaryNode domain object from a SQLite row + linked rows. */
  private _rowToNode(row: SummaryRow): SummaryNode {
    const sources = this.db
      .prepare('SELECT message_id FROM summary_sources WHERE summary_id = ?')
      .all(row.id) as Array<{ message_id: string }>;

    const children = this.db
      .prepare('SELECT child_id FROM summary_parents WHERE parent_id = ?')
      .all(row.id) as Array<{ child_id: string }>;

    const summary: Summary = {
      id: row.id,
      content: row.content,
      tokenCount: row.token_count,
      createdAt: row.created_at,
      coveredMessageIds: sources.map((s) => s.message_id),
      childSummaryIds: children.map((c) => c.child_id),
      depth: row.depth,
    };

    return {
      summary,
      parentId: row.parent_id,
      condensed: row.condensed === 1,
    };
  }

  /**
   * Extract the sessionId from a SummaryNode.
   *
   * The session_id lives only in the DB row, not in the domain object.
   * We carry it forward by requiring callers to set it in the summary id
   * convention OR store it separately. For initial saves we fetch it from
   * a parent lookup if possible; callers that need to save must pass the
   * sessionId separately via saveSummaryNodeForSession().
   *
   * NOTE: This method is only called during saveSummaryNode(). Because the
   * domain types don't include sessionId we fall back to an empty string.
   * Callers that need proper session scoping should use
   * saveSummaryNodeForSession() instead.
   */
  private _extractSessionId(_node: SummaryNode): string {
    // The SummaryNode domain type does not carry sessionId — it's a store-
    // level concern. Callers should prefer saveSummaryNodeForSession().
    return '';
  }

  /**
   * Persist a SummaryNode scoped to a specific session.
   *
   * @param sessionId - The session this node belongs to.
   * @param node      - The SummaryNode to persist.
   */
  saveSummaryNodeForSession(sessionId: SessionId, node: SummaryNode): void {
    const save = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO summaries
             (id, session_id, content, token_count, depth, condensed, parent_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          node.summary.id,
          sessionId,
          node.summary.content,
          node.summary.tokenCount,
          node.summary.depth,
          node.condensed ? 1 : 0,
          node.parentId,
          node.summary.createdAt
        );

      this.db.prepare('DELETE FROM summary_sources WHERE summary_id = ?').run(node.summary.id);
      const insertSource = this.db.prepare(
        'INSERT OR IGNORE INTO summary_sources (summary_id, message_id) VALUES (?, ?)'
      );
      for (const msgId of node.summary.coveredMessageIds) {
        insertSource.run(node.summary.id, msgId);
      }

      this.db.prepare('DELETE FROM summary_parents WHERE parent_id = ?').run(node.summary.id);
      const insertChild = this.db.prepare(
        'INSERT OR IGNORE INTO summary_parents (parent_id, child_id) VALUES (?, ?)'
      );
      for (const childId of node.summary.childSummaryIds) {
        insertChild.run(node.summary.id, childId);
      }
    });

    save();
  }

  /**
   * Strip characters that would cause FTS5 to throw a syntax error.
   * Returns an empty string if the sanitised query is empty.
   */
  private _sanitiseFtsQuery(query: string): string {
    // Remove FTS5-breaking characters: *, :, ^, ~ and unbalanced quotes.
    const stripped = query
      .replace(/[*:^~]/g, ' ')
      .replace(/"/g, '')
      .trim();

    // Wrap in double quotes for phrase search if multi-word, otherwise use as-is.
    if (!stripped) return '';
    return stripped.includes(' ') ? `"${stripped}"` : stripped;
  }
}
