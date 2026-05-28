/**
 * Knowledge Flow Pipeline – End-to-End Tests
 *
 * Verifies the distillation pipeline:
 *   raw PM state → knowledge chunks (domain='project') →
 *   Ava knowledge search → Ava briefing
 *
 * Uses an in-memory SQLite database (better-sqlite3 :memory:) to avoid disk I/O.
 * Skipped in CI when better-sqlite3 native bindings are not available.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';

let Database: typeof BetterSqlite3;
let hasSqlite = false;
try {
  Database = (await import('better-sqlite3')).default;
  hasSqlite = true;
} catch {
  // Native bindings not available (e.g. CI without rebuild)
}
import type { PMWorldState } from '@protolabsai/types';
import { WorldStateDomain } from '@protolabsai/types';
import { KnowledgeIngestionService } from '../src/services/knowledge-ingestion-service.js';

// ────────────────────────── Helpers ──────────────────────────────────────────

/** Create and initialise an in-memory knowledge store DB with the same schema as production */
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

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      heading,
      content,
      content=chunks,
      content_rowid=rowid
    )
  `);

  // Keep FTS5 in sync
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

/** Build a sample PMWorldState for testing */
function buildSampleState(): PMWorldState {
  return {
    domain: WorldStateDomain.Project,
    updatedAt: '2026-03-10T12:00:00.000Z',
    projects: {
      'automaker-core': {
        status: 'active',
        phase: 'development',
        milestoneCount: 3,
        completedMilestones: 1,
      },
    },
    milestones: {
      'auth-foundation': {
        title: 'Auth Foundation',
        totalPhases: 4,
        completedPhases: 4,
        dueAt: '2026-03-15T00:00:00.000Z',
      },
      'knowledge-flow': {
        title: 'Knowledge Flow Pipeline',
        totalPhases: 3,
        completedPhases: 1,
        dueAt: '2026-04-01T00:00:00.000Z',
      },
    },
    ceremonies: {
      retro: '2026-03-20T14:00:00.000Z',
      planning: '2026-03-25T10:00:00.000Z',
    },
    upcomingDeadlines: [
      {
        projectSlug: 'automaker-core',
        label: 'MVP launch',
        dueAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  };
}

// ────────────────────────── Tests ─────────────────────────────────────────────

// Skip all tests when better-sqlite3 native bindings are unavailable (CI)
describe.skipIf(!hasSqlite)('Knowledge Flow Pipeline (requires better-sqlite3)', () => {
  describe('KnowledgeIngestionService.ingestProjectStateChanges', () => {
    let db: BetterSqlite3.Database;
    let ingestion: KnowledgeIngestionService;

    beforeEach(() => {
      db = createTestDb();
      // Mock the embedding orchestrator to be a no-op
      ingestion = new KnowledgeIngestionService({
        runBackgroundEmbedding: vi.fn().mockResolvedValue(undefined),
        getEmbeddingService: vi.fn().mockReturnValue({ isReady: () => false }),
      } as unknown as ConstructorParameters<typeof KnowledgeIngestionService>[0]);
    });

    it('indexes project overview chunk with domain=project tag', async () => {
      const state = buildSampleState();
      const count = await ingestion.ingestProjectStateChanges(db, '/test/project', state);

      expect(count).toBeGreaterThan(0);

      const row = db
        .prepare('SELECT * FROM chunks WHERE id = ?')
        .get('project-overview-snapshot') as
        | { tags: string; content: string; heading: string }
        | undefined;
      expect(row).toBeDefined();
      const tags = JSON.parse(row!.tags) as string[];
      expect(tags).toContain('project');
      expect(row!.content).toContain('automaker-core');
    });

    it('indexes milestone progress chunk with domain=project tag', async () => {
      const state = buildSampleState();
      await ingestion.ingestProjectStateChanges(db, '/test/project', state);

      const row = db
        .prepare('SELECT * FROM chunks WHERE id = ?')
        .get('project-milestones-snapshot') as { tags: string; content: string } | undefined;
      expect(row).toBeDefined();
      const tags = JSON.parse(row!.tags) as string[];
      expect(tags).toContain('project');
      expect(tags).toContain('milestone');
      expect(row!.content).toContain('Auth Foundation');
      expect(row!.content).toContain('Knowledge Flow Pipeline');
      // Completed milestone should be marked
      expect(row!.content).toContain('✅');
    });

    it('indexes ceremonies chunk with domain=project tag', async () => {
      const state = buildSampleState();
      await ingestion.ingestProjectStateChanges(db, '/test/project', state);

      const row = db
        .prepare('SELECT * FROM chunks WHERE id = ?')
        .get('project-ceremonies-snapshot') as { tags: string; content: string } | undefined;
      expect(row).toBeDefined();
      const tags = JSON.parse(row!.tags) as string[];
      expect(tags).toContain('project');
      expect(tags).toContain('ceremony');
    });

    it('indexes timeline deadlines chunk with domain=project tag', async () => {
      const state = buildSampleState();
      await ingestion.ingestProjectStateChanges(db, '/test/project', state);

      const row = db
        .prepare('SELECT * FROM chunks WHERE id = ?')
        .get('project-timeline-snapshot') as { tags: string; content: string } | undefined;
      expect(row).toBeDefined();
      const tags = JSON.parse(row!.tags) as string[];
      expect(tags).toContain('project');
      expect(tags).toContain('timeline');
      expect(row!.content).toContain('MVP launch');
    });

    it('upserts chunks on repeated calls (idempotent)', async () => {
      const state = buildSampleState();
      await ingestion.ingestProjectStateChanges(db, '/test/project', state);
      await ingestion.ingestProjectStateChanges(db, '/test/project', state);

      // Should still be exactly one overview chunk, not two
      const rows = db
        .prepare("SELECT COUNT(*) as cnt FROM chunks WHERE id = 'project-overview-snapshot'")
        .get() as { cnt: number };
      expect(rows.cnt).toBe(1);
    });

    it('returns 0 when state has no projects, milestones, ceremonies, or deadlines', async () => {
      const empty: PMWorldState = {
        domain: WorldStateDomain.Project,
        updatedAt: new Date().toISOString(),
        projects: {},
        milestones: {},
        ceremonies: {},
        upcomingDeadlines: [],
      };
      const count = await ingestion.ingestProjectStateChanges(db, '/test/project', empty);
      expect(count).toBe(0);
    });
  });

  describe('Cross-domain queries', () => {
    let db: BetterSqlite3.Database;
    let ingestion: KnowledgeIngestionService;

    beforeEach(() => {
      db = createTestDb();
      ingestion = new KnowledgeIngestionService({
        runBackgroundEmbedding: vi.fn().mockResolvedValue(undefined),
        getEmbeddingService: vi.fn().mockReturnValue({ isReady: () => false }),
      } as unknown as ConstructorParameters<typeof KnowledgeIngestionService>[0]);
    });

    it('domain=project filter returns only project-tagged chunks', async () => {
      const state = buildSampleState();
      await ingestion.ingestProjectStateChanges(db, '/test/project', state);

      // Insert an engineering chunk (simulating feature completion ingestion)
      const ts = new Date().toISOString();
      db.prepare(
        `INSERT INTO chunks (id, source_type, source_file, project_path, chunk_index, heading, content, tags, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'eng-test-chunk',
        'reflection',
        '.automaker/features/test/reflection.md',
        '/test/project',
        0,
        'Engineering Reflection',
        'A technical reflection on implementation choices.',
        JSON.stringify(['engineering', 'reflection', 'test-feature']),
        0.8,
        ts,
        ts
      );

      // Query for domain=project
      const projectRows = db
        .prepare(
          `SELECT id FROM chunks
         WHERE tags IS NOT NULL
           AND EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?)`
        )
        .all('project') as Array<{ id: string }>;

      const projectIds = projectRows.map((r) => r.id);
      expect(projectIds).toContain('project-overview-snapshot');
      expect(projectIds).toContain('project-milestones-snapshot');
      expect(projectIds).not.toContain('eng-test-chunk');

      // Query for domain=engineering
      const engRows = db
        .prepare(
          `SELECT id FROM chunks
         WHERE tags IS NOT NULL
           AND EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?)`
        )
        .all('engineering') as Array<{ id: string }>;

      const engIds = engRows.map((r) => r.id);
      expect(engIds).toContain('eng-test-chunk');
      expect(engIds).not.toContain('project-overview-snapshot');
    });
  });
}); // end skipIf wrapper
