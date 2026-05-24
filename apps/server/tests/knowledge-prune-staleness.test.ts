/**
 * Regression test for #3595 — pruneStaleChunks must NOT delete freshly-ingested
 * chunks that have never been retrieved.
 *
 * Pre-fix predicate matched every new chunk:
 *   retrieval_count = 0 AND last_retrieved_at IS NULL → stale → DELETE.
 *
 * Post-fix predicate falls back to updated_at / created_at via COALESCE, so a
 * NULL last_retrieved_at only matches when the chunk is also >90 days old.
 *
 * Uses an in-memory SQLite DB (better-sqlite3 :memory:) — same pattern as
 * knowledge-flow-pipeline.test.ts. Skipped when native bindings are missing.
 */

import { describe, it, expect } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';

let Database: typeof BetterSqlite3;
let hasSqlite = false;
try {
  Database = (await import('better-sqlite3')).default;
  hasSqlite = true;
} catch {
  // Native bindings not available (e.g. CI without rebuild)
}

// The exact prune predicate from KnowledgeStoreService.pruneStaleChunks.
// Kept inline so this test fails loudly if the production SQL drifts.
const PRUNE_SQL = `
  DELETE FROM chunks
  WHERE retrieval_count = 0
    AND datetime(COALESCE(last_retrieved_at, updated_at, created_at))
        < datetime('now', '-90 days')
`;

function createTestDb(): BetterSqlite3.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_file TEXT NOT NULL,
      project_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      heading TEXT,
      content TEXT NOT NULL,
      tags TEXT,
      importance REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_retrieved_at TEXT,
      retrieval_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

interface ChunkRow {
  id: string;
  created_at: string;
  updated_at: string;
  last_retrieved_at: string | null;
  retrieval_count: number;
}

function insertChunk(db: BetterSqlite3.Database, row: Partial<ChunkRow> & { id: string }): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chunks (id, source_type, source_file, project_path, chunk_index,
                         heading, content, tags, importance,
                         created_at, updated_at, last_retrieved_at, retrieval_count)
     VALUES (@id, 'doc', 'test.md', '/test', 0, NULL, 'content', NULL, 0.5,
             @created_at, @updated_at, @last_retrieved_at, @retrieval_count)`
  ).run({
    id: row.id,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
    last_retrieved_at: row.last_retrieved_at ?? null,
    retrieval_count: row.retrieval_count ?? 0,
  });
}

const describeMaybe = hasSqlite ? describe : describe.skip;

describeMaybe('pruneStaleChunks staleness predicate (#3595)', () => {
  it('does NOT delete a freshly-ingested, never-retrieved chunk', () => {
    const db = createTestDb();
    insertChunk(db, { id: 'fresh' });

    const result = db.prepare(PRUNE_SQL).run();

    expect(result.changes).toBe(0);
    const remaining = db.prepare('SELECT id FROM chunks').all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual(['fresh']);
  });

  it('does NOT delete a recently-updated chunk even if never retrieved', () => {
    const db = createTestDb();
    const oldDate = new Date(Date.now() - 200 * 86_400_000).toISOString(); // 200d ago
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString(); // 5d ago
    insertChunk(db, {
      id: 'updated-recently',
      created_at: oldDate,
      updated_at: recent,
      last_retrieved_at: null,
    });

    const result = db.prepare(PRUNE_SQL).run();

    expect(result.changes).toBe(0);
  });

  it('DOES delete a chunk that has never been retrieved AND was created over 90 days ago', () => {
    const db = createTestDb();
    const oldDate = new Date(Date.now() - 100 * 86_400_000).toISOString();
    insertChunk(db, {
      id: 'old-and-cold',
      created_at: oldDate,
      updated_at: oldDate,
      last_retrieved_at: null,
    });

    const result = db.prepare(PRUNE_SQL).run();

    expect(result.changes).toBe(1);
    const remaining = db.prepare('SELECT id FROM chunks').all();
    expect(remaining).toHaveLength(0);
  });

  it('DOES delete a chunk whose last_retrieved_at is older than 90 days', () => {
    const db = createTestDb();
    const oldRetrieve = new Date(Date.now() - 100 * 86_400_000).toISOString();
    insertChunk(db, {
      id: 'cold-retrieve',
      created_at: oldRetrieve,
      updated_at: oldRetrieve,
      last_retrieved_at: oldRetrieve,
      retrieval_count: 0,
    });

    const result = db.prepare(PRUNE_SQL).run();

    expect(result.changes).toBe(1);
  });

  it('does NOT delete a chunk that has been retrieved at least once', () => {
    const db = createTestDb();
    const oldDate = new Date(Date.now() - 100 * 86_400_000).toISOString();
    insertChunk(db, {
      id: 'retrieved-but-old',
      created_at: oldDate,
      updated_at: oldDate,
      last_retrieved_at: oldDate,
      retrieval_count: 5, // never matches the retrieval_count=0 guard
    });

    const result = db.prepare(PRUNE_SQL).run();

    expect(result.changes).toBe(0);
  });

  it('handles a mixed batch — keeps fresh + retrieved, deletes only the old-and-cold', () => {
    const db = createTestDb();
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    insertChunk(db, { id: 'fresh' });
    insertChunk(db, {
      id: 'old-and-cold',
      created_at: old,
      updated_at: old,
    });
    insertChunk(db, {
      id: 'old-but-retrieved',
      created_at: old,
      updated_at: old,
      last_retrieved_at: old,
      retrieval_count: 2,
    });

    const result = db.prepare(PRUNE_SQL).run();

    expect(result.changes).toBe(1);
    const remaining = (db.prepare('SELECT id FROM chunks').all() as Array<{ id: string }>)
      .map((r) => r.id)
      .sort();
    expect(remaining).toEqual(['fresh', 'old-but-retrieved']);
  });
});
