/**
 * SQLite schema migrations for the context-engine SummaryStore.
 *
 * Each migration is a pure SQL string identified by a version integer.
 * Migrations are applied in ascending order by version. The migrations
 * table tracks which versions have already been applied, making the
 * process idempotent and safe to re-run.
 *
 * Schema overview
 * ---------------
 * summaries         – the DAG nodes (each compacted summary)
 * summary_sources   – many-to-many: summary → raw message IDs it covers
 * summary_parents   – many-to-many: summary → child summary IDs it condenses
 * context_items     – scratch table tracking the current assembly result
 * summaries_fts     – FTS5 virtual table for full-text search over summaries
 */

// ---------------------------------------------------------------------------
// Migration record type
// ---------------------------------------------------------------------------

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

// ---------------------------------------------------------------------------
// Migrations list
// ---------------------------------------------------------------------------

/**
 * Ordered list of all schema migrations.
 * Append new entries at the end — never reorder or modify existing entries.
 */
export const MIGRATIONS: Migration[] = [
  // -------------------------------------------------------------------------
  // v1 – Core summary DAG tables
  // -------------------------------------------------------------------------
  {
    version: 1,
    description: 'Create summaries, summary_sources, summary_parents, context_items tables',
    sql: `
      -- Tracks which migrations have been applied.
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        description TEXT    NOT NULL,
        applied_at  INTEGER NOT NULL   -- Unix ms
      );

      -- Main summary nodes table.
      -- Each row represents one node in the compaction DAG.
      CREATE TABLE IF NOT EXISTS summaries (
        id            TEXT    PRIMARY KEY,
        session_id    TEXT    NOT NULL,
        content       TEXT    NOT NULL,
        token_count   INTEGER NOT NULL DEFAULT 0,
        depth         INTEGER NOT NULL DEFAULT 0,  -- 0 = leaf (covers raw msgs)
        condensed     INTEGER NOT NULL DEFAULT 0,  -- 1 = superseded by parent
        parent_id     TEXT,                         -- NULL for root nodes
        created_at    INTEGER NOT NULL              -- Unix ms
      );

      CREATE INDEX IF NOT EXISTS summaries_session_idx
        ON summaries (session_id);

      CREATE INDEX IF NOT EXISTS summaries_depth_idx
        ON summaries (session_id, depth);

      CREATE INDEX IF NOT EXISTS summaries_condensed_idx
        ON summaries (session_id, condensed);

      -- Provenance: which raw message IDs does a summary directly cover?
      -- (leaf-level summaries only; depth = 0)
      CREATE TABLE IF NOT EXISTS summary_sources (
        summary_id  TEXT NOT NULL,
        message_id  TEXT NOT NULL,
        PRIMARY KEY (summary_id, message_id),
        FOREIGN KEY (summary_id) REFERENCES summaries (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS summary_sources_message_idx
        ON summary_sources (message_id);

      -- Provenance: which child summary IDs does a parent summary condense?
      -- (internal nodes only; depth > 0)
      CREATE TABLE IF NOT EXISTS summary_parents (
        parent_id TEXT NOT NULL,
        child_id  TEXT NOT NULL,
        PRIMARY KEY (parent_id, child_id),
        FOREIGN KEY (parent_id) REFERENCES summaries (id) ON DELETE CASCADE,
        FOREIGN KEY (child_id)  REFERENCES summaries (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS summary_parents_child_idx
        ON summary_parents (child_id);

      -- Context assembly scratch table.
      -- Populated by ContextEngine.assemble() and consumed by callers.
      -- Rows for a session are replaced atomically on each assemble() call.
      CREATE TABLE IF NOT EXISTS context_items (
        id            TEXT    PRIMARY KEY,
        session_id    TEXT    NOT NULL,
        kind          TEXT    NOT NULL CHECK (kind IN ('message', 'summary')),
        source_id     TEXT    NOT NULL,  -- message id or summary id
        content       TEXT    NOT NULL,
        token_count   INTEGER NOT NULL DEFAULT 0,
        item_order    INTEGER NOT NULL DEFAULT 0,
        assembled_at  INTEGER NOT NULL              -- Unix ms
      );

      CREATE INDEX IF NOT EXISTS context_items_session_idx
        ON context_items (session_id, item_order);
    `,
  },

  // -------------------------------------------------------------------------
  // v2 – FTS5 full-text search index on summaries
  // -------------------------------------------------------------------------
  {
    version: 2,
    description: 'Add FTS5 full-text index on summaries.content',
    sql: `
      -- FTS5 virtual table for semantic/keyword search over summary content.
      -- Uses content= to keep the index in sync with the summaries table via
      -- triggers defined below.
      CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts
        USING fts5(
          content,
          content     = summaries,
          content_rowid = rowid
        );

      -- Keep FTS5 in sync with DML on the summaries table.

      CREATE TRIGGER IF NOT EXISTS summaries_ai
        AFTER INSERT ON summaries BEGIN
          INSERT INTO summaries_fts (rowid, content)
          VALUES (new.rowid, new.content);
        END;

      CREATE TRIGGER IF NOT EXISTS summaries_ad
        AFTER DELETE ON summaries BEGIN
          INSERT INTO summaries_fts (summaries_fts, rowid, content)
          VALUES ('delete', old.rowid, old.content);
        END;

      CREATE TRIGGER IF NOT EXISTS summaries_au
        AFTER UPDATE ON summaries BEGIN
          INSERT INTO summaries_fts (summaries_fts, rowid, content)
          VALUES ('delete', old.rowid, old.content);
          INSERT INTO summaries_fts (rowid, content)
          VALUES (new.rowid, new.content);
        END;
    `,
  },
];

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/**
 * Apply all pending migrations to the given database connection.
 *
 * @param db - An open better-sqlite3 Database instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runMigrations(db: any): void {
  // Ensure the tracking table exists before querying it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT    NOT NULL,
      applied_at  INTEGER NOT NULL
    )
  `);

  const appliedVersions = new Set<number>(
    (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as Array<{
        version: number;
      }>
    ).map((r) => r.version)
  );

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    // Run each migration inside a transaction so a partial failure leaves the
    // database in a consistent state.
    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run(migration.version, migration.description, Date.now());
    });

    applyMigration();
  }
}
