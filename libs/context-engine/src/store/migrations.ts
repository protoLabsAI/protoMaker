/**
 * Migration system for context-engine SQLite schema.
 *
 * Migrations run sequentially on first open and when new migrations are added.
 * Each migration is applied in a transaction so failures leave the schema clean.
 */

import type * as BetterSqlite3 from 'better-sqlite3';

export interface Migration {
  /** Unique monotonically-increasing version number */
  version: number;
  /** Human-readable description of what this migration does */
  description: string;
  /** SQL statements to execute — run inside a single transaction */
  up: string;
}

/**
 * All schema migrations in version order.
 * NEVER modify an existing migration — add a new one instead.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Create conversations, messages, and message_parts tables',
    up: `
      -- Schema version tracking
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      -- Conversations: top-level grouping of messages
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      -- Messages: individual turns within a conversation
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        total_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      -- Message parts: structured content blocks within a message
      CREATE TABLE IF NOT EXISTS message_parts (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('text', 'tool_use', 'tool_result', 'image', 'document')),
        content TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      -- Indices for common access patterns
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
        ON messages(conversation_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_message_parts_message_id
        ON message_parts(message_id, position);
    `,
  },
];

/**
 * Applies all pending migrations to the database.
 * Safe to call on every open — already-applied migrations are skipped.
 */
export function runMigrations(db: BetterSqlite3.Database): void {
  // Ensure the migration tracking table exists before querying it
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set<number>(
    (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as {
        version: number;
      }[]
    ).map((r) => r.version)
  );

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    // Run each migration in a transaction for atomicity
    const apply = db.transaction(() => {
      db.exec(migration.up);
      insertMigration.run(migration.version, migration.description, new Date().toISOString());
    });

    apply();
  }
}

/**
 * Returns the current applied schema version, or 0 if no migrations have run.
 */
export function getCurrentSchemaVersion(db: BetterSqlite3.Database): number {
  try {
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
      | { version: number | null }
      | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}
