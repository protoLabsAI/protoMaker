/**
 * Knowledge Store Service
 *
 * Persistent SQLite-based knowledge store for indexing and searching project documentation,
 * code, and context. Uses FTS5 for full-text search with WAL mode for concurrent reads.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabs-ai/utils';
import type {
  KnowledgeStoreStats,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeChunk,
  KnowledgeStoreSettings,
  RetrievalMode,
} from '@protolabs-ai/types';
import { KnowledgeEmbeddingOrchestrator } from './knowledge-embedding-orchestrator.js';
import { KnowledgeIngestionService } from './knowledge-ingestion-service.js';
import { KnowledgeSearchService } from './knowledge-search-service.js';

const logger = createLogger('KnowledgeStoreService');

/**
 * Knowledge Store Service
 *
 * Manages a SQLite database with FTS5 full-text search for knowledge chunks.
 */
export class KnowledgeStoreService {
  private db: BetterSqlite3.Database | null = null;
  private projectPath: string | null = null;
  private embeddingOrchestrator: KnowledgeEmbeddingOrchestrator;
  private ingestionService: KnowledgeIngestionService;
  private searchService: KnowledgeSearchService | null = null;
  private settings: KnowledgeStoreSettings = {
    maxChunkSize: 1000,
    chunkOverlap: 200,
    defaultImportance: 0.5,
    autoReindex: true,
    excludePatterns: [],
    includePatterns: [],
    hybridRetrieval: true,
  };

  constructor(embeddingOrchestrator?: KnowledgeEmbeddingOrchestrator) {
    this.embeddingOrchestrator = embeddingOrchestrator || new KnowledgeEmbeddingOrchestrator();
    this.ingestionService = new KnowledgeIngestionService(this.embeddingOrchestrator);
  }

  /**
   * Initialize the knowledge store for a given project.
   * Creates the database file and schema if they don't exist.
   *
   * @param projectPath - Absolute path to the project directory
   */
  initialize(projectPath: string): void {
    if (this.db) {
      logger.warn('KnowledgeStoreService already initialized, closing existing connection');
      this.close();
    }

    this.projectPath = projectPath;

    // Ensure .automaker directory exists
    const automakerDir = path.join(projectPath, '.automaker');
    if (!fs.existsSync(automakerDir)) {
      fs.mkdirSync(automakerDir, { recursive: true });
    }

    // Database path
    const dbPath = path.join(automakerDir, 'knowledge.db');
    logger.info(`Initializing knowledge store at ${dbPath}`);

    // Open database with WAL mode for concurrent reads
    this.db = new BetterSqlite3.default(dbPath);

    // Enable WAL mode
    this.db.pragma('journal_mode = WAL');

    // Create schema
    this.createSchema();

    // Initialize search service
    this.searchService = new KnowledgeSearchService(
      this.db,
      this.embeddingOrchestrator.getEmbeddingService(),
      this.settings,
      projectPath
    );

    logger.info('Knowledge store initialized successfully');
  }

  /**
   * Create the database schema (chunks table + FTS5 virtual table + embeddings table)
   */
  private createSchema(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Main chunks table
    this.db.exec(`
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

    // Embeddings table (stores vector embeddings as BLOB)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      )
    `);

    // Migration: Add hype_queries column if it doesn't exist
    try {
      this.db.exec(`
        ALTER TABLE chunks ADD COLUMN hype_queries TEXT
      `);
      logger.debug('Added hype_queries column to chunks table');
    } catch (err) {
      // Column already exists, ignore error
      logger.debug('hype_queries column already exists');
    }

    // Migration: Add hype_embeddings column if it doesn't exist
    try {
      this.db.exec(`
        ALTER TABLE chunks ADD COLUMN hype_embeddings BLOB
      `);
      logger.debug('Added hype_embeddings column to chunks table');
    } catch (err) {
      // Column already exists, ignore error
      logger.debug('hype_embeddings column already exists');
    }

    // FTS5 virtual table for full-text search on heading and content
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        heading,
        content,
        content=chunks,
        content_rowid=rowid
      )
    `);

    // Triggers to keep FTS5 in sync with chunks table
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, heading, content)
        VALUES (new.rowid, new.heading, new.content);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, heading, content)
        VALUES ('delete', old.rowid, old.heading, old.content);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, heading, content)
        VALUES ('delete', old.rowid, old.heading, old.content);
        INSERT INTO chunks_fts(rowid, heading, content)
        VALUES (new.rowid, new.heading, new.content);
      END
    `);

    logger.debug('Database schema created successfully');
  }

  /**
   * Get statistics about the knowledge store
   *
   * @returns KnowledgeStoreStats
   */
  getStats(): KnowledgeStoreStats {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    const dbPath = path.join(this.projectPath, '.automaker', 'knowledge.db');

    // Total chunks
    const totalChunks =
      (this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number })?.count ||
      0;

    // Total size
    let totalSizeBytes = 0;
    try {
      const stats = fs.statSync(dbPath);
      totalSizeBytes = stats.size;
    } catch (err) {
      logger.warn('Failed to get database file size:', err);
    }

    // Unique sources
    const uniqueSources =
      (
        this.db.prepare('SELECT COUNT(DISTINCT source_file) as count FROM chunks').get() as {
          count: number;
        }
      )?.count || 0;

    // Breakdown by source type
    const sourceTypeRows = this.db
      .prepare('SELECT source_type, COUNT(*) as count FROM chunks GROUP BY source_type')
      .all() as Array<{ source_type: string; count: number }>;

    const sourceTypeBreakdown: Record<string, number> = {
      file: 0,
      url: 0,
      manual: 0,
      generated: 0,
      reflection: 0,
      agent_output: 0,
    };

    for (const row of sourceTypeRows) {
      sourceTypeBreakdown[row.source_type] = row.count;
    }

    // Last updated
    const lastUpdatedRow = this.db
      .prepare('SELECT MAX(updated_at) as last_updated FROM chunks')
      .get() as { last_updated: string | null };
    const lastUpdated = lastUpdatedRow?.last_updated || undefined;

    return {
      totalChunks,
      totalSizeBytes,
      uniqueSources,
      sourceTypeBreakdown: sourceTypeBreakdown as Record<
        'file' | 'url' | 'manual' | 'generated' | 'reflection' | 'agent_output',
        number
      >,
      lastUpdated,
      dbPath,
      enabledHybridRetrieval:
        this.settings.hybridRetrieval && this.embeddingOrchestrator.getEmbeddingService().isReady(),
    };
  }

  /**
   * Search the knowledge store using triple-mode fusion (BM25 + direct cosine + HyPE cosine with RRF)
   * Falls back to hybrid (BM25 + direct cosine) or pure BM25 if embeddings/HyPE unavailable.
   *
   * @param projectPath - Project path to search within
   * @param query - FTS5 query string (supports AND, OR, NOT, phrases)
   * @param opts - Search options (maxResults, maxTokens, sourceTypes filter)
   * @returns Object with results array and retrieval_mode
   */
  async search(
    projectPath: string,
    query: string,
    opts: KnowledgeSearchOptions = {}
  ): Promise<{ results: KnowledgeSearchResult[]; retrieval_mode: RetrievalMode }> {
    if (!this.searchService || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      logger.warn(
        `Project path mismatch: initialized with ${this.projectPath}, searching ${projectPath}`
      );
      // Re-initialize for the new project
      this.initialize(projectPath);
    }

    return this.searchService.search(projectPath, query, opts);
  }

  /**
   * Find chunks similar to the given text, optionally filtered by source file.
   * Used for deduplication before appending new learnings.
   *
   * @param projectPath - Project path
   * @param text - Text to search for similar chunks
   * @param sourceFile - Optional source file to filter results
   * @param maxResults - Maximum number of results (default: 5)
   * @returns Array of search results with BM25 scores
   */
  findSimilarChunks(
    projectPath: string,
    text: string,
    sourceFile?: string,
    maxResults: number = 5
  ): KnowledgeSearchResult[] {
    if (!this.searchService || !this.projectPath) {
      return [];
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    return this.searchService.findSimilarChunks(projectPath, text, sourceFile, maxResults);
  }

  /**
   * Rebuild the FTS5 index by re-scanning project files.
   * Called after learning appends to make new content immediately searchable.
   *
   * @param projectPath - Project path to rebuild index for
   */
  rebuildIndex(projectPath: string): void {
    if (!this.db || !this.projectPath) {
      logger.warn('Cannot rebuild index: knowledge store not initialized');
      return;
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    if (!this.db) return;

    this.ingestionService.rebuildIndex(this.db, projectPath);
  }

  /**
   * Compact a category file if it exceeds the token threshold.
   * Counts tokens (content length / 4), and if over threshold, uses Haiku to summarize.
   */
  async compactCategory(
    projectPath: string,
    categoryFile: string,
    compactionThreshold: number = 50000
  ): Promise<void> {
    return this.ingestionService.compactCategory(projectPath, categoryFile, compactionThreshold);
  }

  /**
   * Prune stale chunks that haven't been retrieved in over 90 days with zero retrieval count.
   */
  pruneStaleChunks(projectPath: string): number {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    const sql = `
      DELETE FROM chunks
      WHERE retrieval_count = 0
        AND (
          last_retrieved_at IS NULL
          OR datetime(last_retrieved_at) < datetime('now', '-90 days')
        )
    `;

    const result = this.db!.prepare(sql).run();
    const deletedCount = result.changes;

    logger.info(`Pruned ${deletedCount} stale chunks from knowledge store`);
    return deletedCount;
  }

  /**
   * Get embedding status for a project.
   * Returns the total number of chunks, how many have embeddings, and how many are pending.
   * Delegates to KnowledgeEmbeddingOrchestrator.
   *
   * @param projectPath - Project path to check
   * @returns Object with total, embedded, and pending counts
   */
  getEmbeddingStatus(projectPath: string): { total: number; embedded: number; pending: number } {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    if (!this.db) {
      return { total: 0, embedded: 0, pending: 0 };
    }

    return this.embeddingOrchestrator.getEmbeddingStatus(this.db);
  }

  /**
   * Get HyPE status for a project.
   * Returns the total number of chunks, how many have HyPE embeddings, and how many are pending.
   * Delegates to KnowledgeEmbeddingOrchestrator.
   *
   * @param projectPath - Project path to check
   * @returns Object with total, hype_ready, and pending counts
   */
  getHypeStatus(projectPath: string): { total: number; hype_ready: number; pending: number } {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    if (!this.db) {
      return { total: 0, hype_ready: 0, pending: 0 };
    }

    return this.embeddingOrchestrator.getHypeStatus(this.db);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      logger.debug('Closing knowledge store database');
      this.db.close();
      this.db = null;
      this.projectPath = null;
    }
  }

  /**
   * Get the database instance (for advanced operations)
   * @internal
   */
  getDatabase(): BetterSqlite3.Database | null {
    return this.db;
  }

  /**
   * Ingest reflection.md files from all features in the project.
   * Scans all .automaker/features/ directories and indexes reflection.md content.
   *
   * @param projectPath - Project path to scan
   * @returns Number of reflections indexed
   */
  async ingestReflections(projectPath: string): Promise<number> {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    return this.ingestionService.ingestReflections(this.db, projectPath);
  }

  /**
   * Ingest agent-output.md files from all features in the project.
   * Indexes the last 2000 characters (summary section) of each agent-output.md.
   *
   * @param projectPath - Project path to scan
   * @returns Number of agent outputs indexed
   */
  async ingestAgentOutputs(projectPath: string): Promise<number> {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    return this.ingestionService.ingestAgentOutputs(this.db, projectPath);
  }

  /**
   * Search for reflections and agent outputs using FTS5.
   * Convenience method that filters to reflection and agent_output source types.
   *
   * @param projectPath - Project path
   * @param query - Search query (feature title + description works well)
   * @param maxResults - Maximum number of results (default: 5)
   * @returns Array of search results with relevance scores
   */
  async searchReflections(
    projectPath: string,
    query: string,
    maxResults: number = 5
  ): Promise<KnowledgeSearchResult[]> {
    if (!this.searchService || !this.projectPath) {
      return [];
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    return this.searchService.searchReflections(projectPath, query, maxResults);
  }

  /**
   * Get aggregate evaluation statistics from knowledge-eval.jsonl.
   * Returns metrics on retrieval mode usage and rank distribution.
   *
   * @param projectPath - Project path
   * @returns Aggregate statistics
   */
  async getEvalStats(projectPath: string): Promise<{
    total_searches: number;
    retrieval_mode_counts: Record<RetrievalMode, number>;
    avg_top_rank: number;
    source_type_coverage: Record<string, number>;
  }> {
    try {
      const evalLogPath = path.join(projectPath, '.automaker', 'knowledge-eval.jsonl');

      if (!fs.existsSync(evalLogPath)) {
        return {
          total_searches: 0,
          retrieval_mode_counts: { hybrid_hype: 0, hybrid: 0, bm25: 0 },
          avg_top_rank: 0,
          source_type_coverage: {},
        };
      }

      const content = await fs.promises.readFile(evalLogPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      const retrieval_mode_counts: Record<RetrievalMode, number> = {
        hybrid_hype: 0,
        hybrid: 0,
        bm25: 0,
      };
      const source_type_coverage: Record<string, number> = {};
      let total_top_rank = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Count retrieval modes
          if (entry.retrieval_mode) {
            retrieval_mode_counts[entry.retrieval_mode as RetrievalMode] =
              (retrieval_mode_counts[entry.retrieval_mode as RetrievalMode] || 0) + 1;
          }

          // Track source type coverage (count unique source types in top results)
          if (entry.top_results && Array.isArray(entry.top_results)) {
            for (const result of entry.top_results) {
              const sourceType = result.source_type;
              source_type_coverage[sourceType] = (source_type_coverage[sourceType] || 0) + 1;
            }

            // Track average rank of first result (for rank improvement analysis)
            if (entry.top_results.length > 0) {
              total_top_rank += entry.top_results[0].rank;
            }
          }
        } catch (parseError) {
          logger.warn('Failed to parse eval log entry:', parseError);
          // Continue processing other entries
        }
      }

      const total_searches = lines.length;
      const avg_top_rank = total_searches > 0 ? total_top_rank / total_searches : 0;

      return {
        total_searches,
        retrieval_mode_counts,
        avg_top_rank,
        source_type_coverage,
      };
    } catch (error) {
      logger.warn('Failed to get eval stats:', error);
      return {
        total_searches: 0,
        retrieval_mode_counts: { hybrid_hype: 0, hybrid: 0, bm25: 0 },
        avg_top_rank: 0,
        source_type_coverage: {},
      };
    }
  }
}
