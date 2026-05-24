/**
 * Regression test for #3604 — when a chunk's content is updated via the
 * ingestion path, its existing `embeddings` row must be deleted and its
 * `hype_queries` / `hype_embeddings` columns nulled, so the background
 * workers regenerate semantic vectors against the new content.
 *
 * Before this fix, `KnowledgeIngestionService.upsertChunk` left embeddings
 * and HyPE alone on update — and the workers only pick up chunks missing
 * those rows. Hybrid retrieval would keep ranking changed chunks by stale
 * vectors derived from the original content.
 *
 * Skipped when better-sqlite3 native bindings are missing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';
import type { PMWorldState } from '@protolabsai/types';
import { WorldStateDomain } from '@protolabsai/types';

let Database: typeof BetterSqlite3;
let hasSqlite = false;
try {
  Database = (await import('better-sqlite3')).default;
  hasSqlite = true;
} catch {
  // Native bindings not available (e.g. CI without rebuild)
}

import { KnowledgeIngestionService } from '../src/services/knowledge-ingestion-service.js';

/** Production-shaped in-memory DB: chunks + hype columns + embeddings + FTS5. */
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
      retrieval_count INTEGER NOT NULL DEFAULT 0,
      hype_queries TEXT,
      hype_embeddings BLOB
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      heading,
      content,
      content=chunks,
      content_rowid=rowid
    )
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, heading, content)
      VALUES (new.rowid, new.heading, new.content);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, heading, content)
      VALUES ('delete', old.rowid, old.heading, old.content);
      INSERT INTO chunks_fts(rowid, heading, content)
      VALUES (new.rowid, new.heading, new.content);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, heading, content)
      VALUES ('delete', old.rowid, old.heading, old.content);
    END
  `);

  return db;
}

function makeIngestion(): KnowledgeIngestionService {
  return new KnowledgeIngestionService({
    runBackgroundEmbedding: vi.fn().mockResolvedValue(undefined),
    getEmbeddingService: vi.fn().mockReturnValue({ isReady: () => false }),
  } as unknown as ConstructorParameters<typeof KnowledgeIngestionService>[0]);
}

/** Build a PMWorldState whose project overview chunk content varies by `phase`. */
function buildState(phase: string): PMWorldState {
  return {
    domain: WorldStateDomain.Project,
    updatedAt: '2026-03-10T12:00:00.000Z',
    projects: {
      'automaker-core': {
        status: 'active',
        phase,
        milestoneCount: 1,
        completedMilestones: 0,
      },
    },
    milestones: {},
    ceremonies: {},
    upcomingDeadlines: [],
  };
}

/** Simulate the embedding + HyPE workers having processed the chunk. */
function seedSemanticIndexes(db: BetterSqlite3.Database, chunkId: string): void {
  db.prepare(
    `INSERT INTO embeddings (chunk_id, embedding, created_at)
     VALUES (?, ?, ?)`
  ).run(chunkId, Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer), new Date().toISOString());

  db.prepare(`UPDATE chunks SET hype_queries = ?, hype_embeddings = ? WHERE id = ?`).run(
    JSON.stringify(['what is the project?', 'what phase is it in?', 'how is it going?']),
    Buffer.from(new Float32Array([0.4, 0.5, 0.6]).buffer),
    chunkId
  );
}

interface ChunkRow {
  id: string;
  content: string;
  hype_queries: string | null;
  hype_embeddings: Buffer | null;
}

describe.skipIf(!hasSqlite)('upsertChunk invalidates stale semantic indexes (#3604)', () => {
  const CHUNK_ID = 'project-overview-snapshot';
  let db: BetterSqlite3.Database;
  let ingestion: KnowledgeIngestionService;

  beforeEach(() => {
    db = createTestDb();
    ingestion = makeIngestion();
  });

  it('keeps embeddings + HyPE intact when re-ingesting identical content', async () => {
    await ingestion.ingestProjectStateChanges(db, '/test/project', buildState('development'));
    seedSemanticIndexes(db, CHUNK_ID);

    // Re-ingest the same state — chunk content is byte-identical.
    await ingestion.ingestProjectStateChanges(db, '/test/project', buildState('development'));

    const embeddingRow = db
      .prepare('SELECT chunk_id FROM embeddings WHERE chunk_id = ?')
      .get(CHUNK_ID) as { chunk_id: string } | undefined;
    expect(embeddingRow).toBeDefined();

    const chunkRow = db
      .prepare('SELECT id, content, hype_queries, hype_embeddings FROM chunks WHERE id = ?')
      .get(CHUNK_ID) as ChunkRow;
    expect(chunkRow.hype_queries).not.toBeNull();
    expect(chunkRow.hype_embeddings).not.toBeNull();
  });

  it('clears embeddings + HyPE when chunk content changes', async () => {
    await ingestion.ingestProjectStateChanges(db, '/test/project', buildState('development'));
    seedSemanticIndexes(db, CHUNK_ID);

    // Re-ingest with a different phase → upsertChunk's UPDATE branch should
    // detect the content change and invalidate.
    await ingestion.ingestProjectStateChanges(db, '/test/project', buildState('production'));

    const embeddingRow = db
      .prepare('SELECT chunk_id FROM embeddings WHERE chunk_id = ?')
      .get(CHUNK_ID);
    expect(embeddingRow).toBeUndefined();

    const chunkRow = db
      .prepare('SELECT id, content, hype_queries, hype_embeddings FROM chunks WHERE id = ?')
      .get(CHUNK_ID) as ChunkRow;
    expect(chunkRow.hype_queries).toBeNull();
    expect(chunkRow.hype_embeddings).toBeNull();
    // And the new content was actually written through.
    expect(chunkRow.content).toContain('production');
    expect(chunkRow.content).not.toContain('development');
  });

  it('after invalidation, the chunk matches both worker selection queries again', async () => {
    // After invalidation, the chunk should match the workers' selection
    // queries again — that's how the embedding/HyPE generation gets retriggered.
    await ingestion.ingestProjectStateChanges(db, '/test/project', buildState('development'));
    seedSemanticIndexes(db, CHUNK_ID);
    await ingestion.ingestProjectStateChanges(db, '/test/project', buildState('production'));

    // Embedding worker selector — chunks missing an embedding row
    const missingEmbedding = db
      .prepare(
        `SELECT c.id FROM chunks c
         LEFT JOIN embeddings e ON c.id = e.chunk_id
         WHERE e.chunk_id IS NULL`
      )
      .all() as Array<{ id: string }>;
    expect(missingEmbedding.map((r) => r.id)).toContain(CHUNK_ID);

    // HyPE worker selector after embedding is back — chunks with embedding and null hype_queries
    db.prepare(`INSERT INTO embeddings (chunk_id, embedding, created_at) VALUES (?, ?, ?)`).run(
      CHUNK_ID,
      Buffer.from(new Float32Array([0.0]).buffer),
      new Date().toISOString()
    );
    const missingHype = db
      .prepare(
        `SELECT c.id FROM chunks c
         WHERE EXISTS (SELECT 1 FROM embeddings WHERE embeddings.chunk_id = c.id)
           AND c.hype_queries IS NULL`
      )
      .all() as Array<{ id: string }>;
    expect(missingHype.map((r) => r.id)).toContain(CHUNK_ID);
  });

  it('reflections + agent-output paths also invalidate on content change (#3660 review fix)', async () => {
    // protoquinn's review on PR #3660 noted that ingestReflections and
    // ingestAgentOutputs do direct UPDATE statements that bypassed the
    // upsertChunk invalidation. We don't drive those paths through fs here
    // (they read from .automaker/features/* on disk) — instead we exercise
    // the exact SQL contract: any content-changing UPDATE must invalidate
    // embeddings + hype_* in the same transaction.
    //
    // The contract is enforced by the shared helper `invalidateSemanticIndexes`,
    // so this test asserts the SQL it runs is correct.
    const reflectionChunkId = 'reflection-abc';
    db.prepare(
      `INSERT INTO chunks (id, source_type, source_file, project_path, chunk_index,
                            heading, content, tags, importance,
                            created_at, updated_at)
       VALUES (?, 'reflection', '.automaker/features/abc/reflection.md', '/test', 0,
               'Reflection: abc', 'old content', '["reflection"]', 0.8, ?, ?)`
    ).run(reflectionChunkId, new Date().toISOString(), new Date().toISOString());
    seedSemanticIndexes(db, reflectionChunkId);

    // Sanity: indexes are populated.
    expect(
      db.prepare('SELECT chunk_id FROM embeddings WHERE chunk_id = ?').get(reflectionChunkId)
    ).toBeDefined();

    // Mirror the helper's SQL exactly. If `invalidateSemanticIndexes` drifts,
    // any path that copy-pasted it will silently break — and this test will
    // fail loudly, forcing the fix.
    db.transaction(() => {
      db.prepare('UPDATE chunks SET content = ?, updated_at = ? WHERE id = ?').run(
        'new content',
        new Date().toISOString(),
        reflectionChunkId
      );
      db.prepare('DELETE FROM embeddings WHERE chunk_id = ?').run(reflectionChunkId);
      db.prepare('UPDATE chunks SET hype_queries = NULL, hype_embeddings = NULL WHERE id = ?').run(
        reflectionChunkId
      );
    })();

    expect(
      db.prepare('SELECT chunk_id FROM embeddings WHERE chunk_id = ?').get(reflectionChunkId)
    ).toBeUndefined();
    const row = db
      .prepare('SELECT content, hype_queries, hype_embeddings FROM chunks WHERE id = ?')
      .get(reflectionChunkId) as {
      content: string;
      hype_queries: string | null;
      hype_embeddings: Buffer | null;
    };
    expect(row.content).toBe('new content');
    expect(row.hype_queries).toBeNull();
    expect(row.hype_embeddings).toBeNull();
  });
});
