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
import { PMWorldStateBuilder } from '../src/services/pm-world-state-builder.js';
import { AvaWorldStateBuilder } from '../src/services/ava-world-state-builder.js';
import type {
  PMKnowledgeIngestor,
  PMWorldStateBuilderConfig,
} from '../src/services/pm-world-state-builder.js';
import type { KnowledgeSearchProvider } from '../src/services/ava-world-state-builder.js';

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

  describe('PMWorldStateBuilder – knowledge ingestion on buildState()', () => {
    it('calls knowledgeIngestor.ingestProjectStateChanges after state refresh', async () => {
      const ingestFn = vi.fn().mockResolvedValue(3);
      const ingestor: PMKnowledgeIngestor = {
        ingestProjectStateChanges: ingestFn,
      };

      const config: PMWorldStateBuilderConfig = {
        // Use a temp dir — projects directory won't exist, so state will be empty
        projectRoot: '/tmp/pm-test-nonexistent',
        knowledgeIngestor: ingestor,
        knowledgeProjectPath: '/tmp/knowledge-test',
      };

      const builder = new PMWorldStateBuilder(config);
      await builder.buildState();

      expect(ingestFn).toHaveBeenCalledOnce();
      const [projectPath, state] = ingestFn.mock.calls[0] as [string, PMWorldState];
      expect(projectPath).toBe('/tmp/knowledge-test');
      expect(state.domain).toBe(WorldStateDomain.Project);
    });

    it('does not call ingestor when knowledgeIngestor is not configured', async () => {
      const builder = new PMWorldStateBuilder({ projectRoot: '/tmp/pm-test-no-ingestor' });
      // Should not throw
      await expect(builder.buildState()).resolves.not.toThrow();
    });

    it('does not fail if knowledgeIngestor throws', async () => {
      const ingestor: PMKnowledgeIngestor = {
        ingestProjectStateChanges: vi.fn().mockRejectedValue(new Error('DB connection failed')),
      };

      const builder = new PMWorldStateBuilder({
        projectRoot: '/tmp/pm-test-error',
        knowledgeIngestor: ingestor,
      });

      // buildState() should still succeed even if ingestion fails
      await expect(builder.buildState()).resolves.not.toThrow();
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

  describe('AvaWorldStateBuilder.getFullBriefing() – knowledge insights', () => {
    it('includes Knowledge Insights section when knowledgeSearch is provided', async () => {
      // Mock PM builder
      const mockPmBuilder = {
        getDistilledSummary: vi.fn().mockReturnValue('## Project Status\n- test: active'),
        getState: vi.fn().mockReturnValue({
          domain: WorldStateDomain.Project,
          updatedAt: new Date().toISOString(),
          projects: {},
          milestones: {},
          ceremonies: {},
          upcomingDeadlines: [],
        }),
      };

      // Mock LE provider
      const mockLeProvider = {
        getWorldStateSummary: vi.fn().mockReturnValue('## Features\n- test feature'),
      };

      // Mock knowledge search provider returning project results
      const mockSearch: KnowledgeSearchProvider = {
        search: vi.fn().mockImplementation(async (_path, _query, opts) => {
          if (opts?.domain === 'project') {
            return {
              results: [
                {
                  chunk: {
                    content: '# Project Overview\n- automaker-core: active / development',
                    heading: 'Project Overview',
                  },
                },
              ],
            };
          }
          return { results: [] };
        }),
      };

      const builder = new AvaWorldStateBuilder(
        mockPmBuilder as unknown as ConstructorParameters<typeof AvaWorldStateBuilder>[0],
        mockLeProvider,
        {
          knowledgeSearch: mockSearch,
          knowledgeProjectPath: '/test/project',
        }
      );

      const briefing = await builder.getFullBriefing();

      expect(briefing).toContain('## Knowledge Insights');
      expect(briefing).toContain('### Project Knowledge');
      expect(briefing).toContain('Project Overview');
      expect(briefing).toContain('### Engineering Knowledge');
    });

    it('omits Knowledge Insights section when no knowledgeSearch configured', async () => {
      const mockPmBuilder = {
        getDistilledSummary: vi.fn().mockReturnValue('## Project Status'),
        getState: vi.fn().mockReturnValue({
          domain: WorldStateDomain.Project,
          updatedAt: new Date().toISOString(),
          projects: {},
          milestones: {},
          ceremonies: {},
          upcomingDeadlines: [],
        }),
      };
      const mockLeProvider = {
        getWorldStateSummary: vi.fn().mockReturnValue('## Features'),
      };

      const builder = new AvaWorldStateBuilder(
        mockPmBuilder as unknown as ConstructorParameters<typeof AvaWorldStateBuilder>[0],
        mockLeProvider,
        {}
      );

      const briefing = await builder.getFullBriefing();
      expect(briefing).not.toContain('## Knowledge Insights');
    });

    it('shows fallback message when knowledge store has no indexed chunks', async () => {
      const mockPmBuilder = {
        getDistilledSummary: vi.fn().mockReturnValue(''),
        getState: vi.fn().mockReturnValue({
          domain: WorldStateDomain.Project,
          updatedAt: new Date().toISOString(),
          projects: {},
          milestones: {},
          ceremonies: {},
          upcomingDeadlines: [],
        }),
      };
      const mockLeProvider = {
        getWorldStateSummary: vi.fn().mockReturnValue(''),
      };

      // Empty search results
      const mockSearch: KnowledgeSearchProvider = {
        search: vi.fn().mockResolvedValue({ results: [] }),
      };

      const builder = new AvaWorldStateBuilder(
        mockPmBuilder as unknown as ConstructorParameters<typeof AvaWorldStateBuilder>[0],
        mockLeProvider,
        {
          knowledgeSearch: mockSearch,
          knowledgeProjectPath: '/test/empty',
        }
      );

      const briefing = await builder.getFullBriefing();
      expect(briefing).toContain('No project knowledge chunks indexed yet');
      expect(briefing).toContain('No engineering knowledge chunks indexed yet');
    });

    it('includes both project and engineering domain queries', async () => {
      const mockPmBuilder = {
        getDistilledSummary: vi.fn().mockReturnValue(''),
        getState: vi.fn().mockReturnValue({
          domain: WorldStateDomain.Project,
          updatedAt: new Date().toISOString(),
          projects: {},
          milestones: {},
          ceremonies: {},
          upcomingDeadlines: [],
        }),
      };
      const mockLeProvider = { getWorldStateSummary: vi.fn().mockReturnValue('') };

      const mockSearch: KnowledgeSearchProvider = {
        search: vi.fn().mockResolvedValue({ results: [] }),
      };

      const builder = new AvaWorldStateBuilder(
        mockPmBuilder as unknown as ConstructorParameters<typeof AvaWorldStateBuilder>[0],
        mockLeProvider,
        { knowledgeSearch: mockSearch, knowledgeProjectPath: '/test/project' }
      );

      await builder.getFullBriefing();

      const calls = (mockSearch.search as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        string,
        { domain?: string },
      ][];
      const domains = calls.map((c) => c[2]?.domain);
      expect(domains).toContain('project');
      expect(domains).toContain('engineering');
    });
  });

  describe('Distillation pipeline – end-to-end', () => {
    it('flows raw state → knowledge chunks → briefing with real in-memory DB', async () => {
      // 1. Set up in-memory DB
      const db = createTestDb();

      const ingestion = new KnowledgeIngestionService({
        runBackgroundEmbedding: vi.fn().mockResolvedValue(undefined),
        getEmbeddingService: vi.fn().mockReturnValue({ isReady: () => false }),
      } as unknown as ConstructorParameters<typeof KnowledgeIngestionService>[0]);

      // 2. Ingest raw PM state
      const state = buildSampleState();
      const ingestedCount = await ingestion.ingestProjectStateChanges(db, '/test/e2e', state);
      expect(ingestedCount).toBeGreaterThan(0);

      // 3. Build knowledge search provider using the in-memory DB directly
      const knowledgeSearch: KnowledgeSearchProvider = {
        search: async (_projectPath, _query, opts) => {
          const domain = opts?.domain;
          let sql = `
          SELECT c.content, c.heading
          FROM chunks c
          WHERE 1=1
        `;
          const params: unknown[] = [];
          if (domain) {
            sql += ` AND c.tags IS NOT NULL AND EXISTS (
            SELECT 1 FROM json_each(c.tags) WHERE json_each.value = ?
          )`;
            params.push(domain);
          }
          sql += ' LIMIT 10';
          const rows = db.prepare(sql).all(...params) as Array<{
            content: string;
            heading: string | null;
          }>;
          return {
            results: rows.map((r) => ({
              chunk: { content: r.content, heading: r.heading ?? undefined },
            })),
          };
        },
      };

      // 4. Build Ava briefing
      const mockPmBuilder = {
        getDistilledSummary: vi.fn().mockReturnValue('## Project Status\n- automaker-core: active'),
        getState: vi.fn().mockReturnValue(state),
      };
      const mockLeProvider = {
        getWorldStateSummary: vi.fn().mockReturnValue('## Engineering\n- All good'),
      };

      const avaBuilder = new AvaWorldStateBuilder(
        mockPmBuilder as unknown as ConstructorParameters<typeof AvaWorldStateBuilder>[0],
        mockLeProvider,
        { knowledgeSearch, knowledgeProjectPath: '/test/e2e' }
      );

      const briefing = await avaBuilder.getFullBriefing();

      // 5. Verify the full pipeline
      expect(briefing).toContain('# Ava Full Briefing');
      expect(briefing).toContain('## Project Management Layer');
      expect(briefing).toContain('## Engineering Layer');
      expect(briefing).toContain('## Knowledge Insights');
      expect(briefing).toContain('### Project Knowledge');
      // The project chunk content should appear (overview mentions 'automaker-core')
      expect(briefing).toContain('automaker-core');

      db.close();
    });
  });
}); // end skipIf wrapper
