/**
 * Knowledge Store Service
 *
 * Persistent SQLite-based knowledge store for indexing and searching project documentation,
 * code, and context. Uses FTS5 for full-text search with WAL mode for concurrent reads.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as BetterSqlite3 from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@protolabs-ai/utils';
import type {
  KnowledgeStoreStats,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeChunk,
  KnowledgeStoreSettings,
} from '@protolabs-ai/types';
import { EmbeddingService } from './embedding-service.js';
import { KnowledgeIngestionService } from './knowledge-ingestion-service.js';

const logger = createLogger('KnowledgeStoreService');

/**
 * Knowledge Store Service
 *
 * Manages a SQLite database with FTS5 full-text search for knowledge chunks.
 */
export class KnowledgeStoreService {
  private db: BetterSqlite3.Database | null = null;
  private projectPath: string | null = null;
  private embeddingService: EmbeddingService;
  private ingestionService: KnowledgeIngestionService;
  private settings: KnowledgeStoreSettings = {
    maxChunkSize: 1000,
    chunkOverlap: 200,
    defaultImportance: 0.5,
    autoReindex: true,
    excludePatterns: [],
    includePatterns: [],
    hybridRetrieval: true,
  };

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || new EmbeddingService();
    this.ingestionService = new KnowledgeIngestionService(this.embeddingService);
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
      enabledHybridRetrieval: this.settings.hybridRetrieval && this.embeddingService.isReady(),
    };
  }

  /**
   * Search the knowledge store using hybrid retrieval (BM25 + cosine similarity with RRF)
   * Falls back to pure BM25 if embeddings are unavailable.
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
  ): Promise<{ results: KnowledgeSearchResult[]; retrieval_mode: 'hybrid' | 'bm25' }> {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    if (this.projectPath !== projectPath) {
      logger.warn(
        `Project path mismatch: initialized with ${this.projectPath}, searching ${projectPath}`
      );
      // Re-initialize for the new project
      this.initialize(projectPath);
    }

    const { maxResults = 20, maxTokens = 8000, sourceTypes = 'all' } = opts;

    // Determine if we can use hybrid retrieval
    const canUseHybrid = this.settings.hybridRetrieval && this.embeddingService.isReady();

    let retrievalMode: 'hybrid' | 'bm25' = 'bm25';

    // Step 1: Run BM25 FTS5 search to get top-50 candidates
    const candidateLimit = canUseHybrid ? 50 : maxResults;

    let sql = `
      SELECT
        c.id,
        c.source_type,
        c.source_file,
        c.project_path,
        c.chunk_index,
        c.heading,
        c.content,
        c.tags,
        c.importance,
        c.created_at,
        c.updated_at,
        bm25(chunks_fts) as score
      FROM chunks_fts
      JOIN chunks c ON chunks_fts.rowid = c.rowid
      WHERE chunks_fts MATCH ?
    `;

    const params: unknown[] = [query];
    if (sourceTypes !== 'all' && sourceTypes.length > 0) {
      const placeholders = sourceTypes.map(() => '?').join(', ');
      sql += ` AND c.source_type IN (${placeholders})`;
      params.push(...sourceTypes);
    }

    sql += ' ORDER BY score LIMIT ?';
    params.push(candidateLimit);

    logger.debug(`Executing FTS5 search: query="${query}", candidateLimit=${candidateLimit}`);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      id: string;
      source_type: string;
      source_file: string;
      project_path: string;
      chunk_index: number;
      heading: string | null;
      content: string;
      tags: string | null;
      importance: number;
      created_at: string;
      updated_at: string;
      score: number;
    }>;

    // Step 2: If hybrid retrieval is enabled, compute RRF merge
    let rankedRows = rows;

    if (canUseHybrid && rows.length > 0) {
      try {
        // Embed the query
        const queryEmbedding = await this.embeddingService.embed(query);

        if (queryEmbedding) {
          // Load embeddings for candidates
          const chunkIds = rows.map((r) => r.id);
          const placeholders = chunkIds.map(() => '?').join(', ');
          const embeddingSql = `
            SELECT chunk_id, embedding
            FROM embeddings
            WHERE chunk_id IN (${placeholders})
          `;

          const embeddingRows = this.db.prepare(embeddingSql).all(...chunkIds) as Array<{
            chunk_id: string;
            embedding: Buffer;
          }>;

          // Build a map of chunk_id -> embedding
          const embeddingMap = new Map<string, Float32Array>();
          for (const row of embeddingRows) {
            // Convert Buffer to Float32Array
            const floatArray = new Float32Array(
              row.embedding.buffer,
              row.embedding.byteOffset,
              row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
            );
            embeddingMap.set(row.chunk_id, floatArray);
          }

          // Compute cosine similarity for chunks with embeddings
          const cosineSimilarities = new Map<string, number>();
          for (const row of rows) {
            const embedding = embeddingMap.get(row.id);
            if (embedding) {
              const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, embedding);
              cosineSimilarities.set(row.id, similarity);
            }
          }

          // Only proceed with hybrid if we have embeddings
          if (cosineSimilarities.size > 0) {
            // Step 3: Rank by BM25 (ascending order - lower score is better)
            const bm25Ranked = [...rows].sort((a, b) => a.score - b.score);
            const bm25RankMap = new Map<string, number>();
            bm25Ranked.forEach((row, index) => {
              bm25RankMap.set(row.id, index + 1);
            });

            // Step 4: Rank by cosine similarity (descending - higher is better)
            const cosineRanked = [...rows]
              .filter((r) => cosineSimilarities.has(r.id))
              .sort((a, b) => {
                const simA = cosineSimilarities.get(a.id) || 0;
                const simB = cosineSimilarities.get(b.id) || 0;
                return simB - simA;
              });
            const cosineRankMap = new Map<string, number>();
            cosineRanked.forEach((row, index) => {
              cosineRankMap.set(row.id, index + 1);
            });

            // Step 5: RRF merge with k=60
            const k = 60;
            const rrfScores = new Map<string, number>();

            for (const row of rows) {
              const bm25Rank = bm25RankMap.get(row.id) || rows.length + 1;
              const cosineRank = cosineRankMap.get(row.id) || rows.length + 1;

              const rrfScore = 1 / (k + bm25Rank) + 1 / (k + cosineRank);
              rrfScores.set(row.id, rrfScore);
            }

            // Step 6: Sort by RRF score (higher is better)
            rankedRows = [...rows].sort((a, b) => {
              const scoreA = rrfScores.get(a.id) || 0;
              const scoreB = rrfScores.get(b.id) || 0;
              return scoreB - scoreA;
            });

            retrievalMode = 'hybrid';
            logger.info(
              `Hybrid retrieval: ${cosineSimilarities.size}/${rows.length} chunks with embeddings`
            );
          } else {
            logger.debug('No embeddings found for candidates, falling back to BM25');
          }
        } else {
          logger.debug('Query embedding failed, falling back to BM25');
        }
      } catch (error) {
        logger.warn('Hybrid retrieval error, falling back to BM25:', error);
      }
    }

    // Apply token budget enforcement
    const results: KnowledgeSearchResult[] = [];
    let totalTokens = 0;

    for (const row of rankedRows) {
      if (results.length >= maxResults) {
        break;
      }

      // Estimate tokens: ~4 chars per token
      const contentTokens = Math.ceil(row.content.length / 4);
      const headingTokens = row.heading ? Math.ceil(row.heading.length / 4) : 0;
      const chunkTokens = contentTokens + headingTokens;

      // Check if adding this chunk would exceed the budget
      if (totalTokens + chunkTokens > maxTokens) {
        logger.debug(
          `Token budget exhausted: ${totalTokens}/${maxTokens} tokens used, skipping ${rankedRows.length - results.length} remaining chunks`
        );
        break;
      }

      // Parse tags from JSON string
      const tags = row.tags ? (JSON.parse(row.tags) as string[]) : undefined;

      const chunk: KnowledgeChunk = {
        id: row.id,
        sourceType: row.source_type as KnowledgeChunk['sourceType'],
        sourceFile: row.source_file,
        projectPath: row.project_path,
        chunkIndex: row.chunk_index,
        heading: row.heading || undefined,
        content: row.content,
        tags,
        importance: row.importance,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      results.push({
        chunk,
        score: row.score,
      });

      totalTokens += chunkTokens;
    }

    logger.info(
      `Search completed (${retrievalMode}): ${results.length} chunks returned, ${totalTokens}/${maxTokens} tokens used`
    );

    // Update usage tracking for returned chunks
    if (results.length > 0) {
      const chunkIds = results.map((r) => r.chunk.id);
      const placeholders = chunkIds.map(() => '?').join(', ');
      const updateSql = `
        UPDATE chunks
        SET retrieval_count = retrieval_count + 1,
            last_retrieved_at = datetime('now')
        WHERE id IN (${placeholders})
      `;
      this.db.prepare(updateSql).run(...chunkIds);
      logger.debug(`Updated usage tracking for ${chunkIds.length} chunks`);
    }

    return { results, retrieval_mode: retrievalMode };
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
    if (!this.db || !this.projectPath) {
      return [];
    }

    if (this.projectPath !== projectPath) {
      this.initialize(projectPath);
    }

    // Sanitize text for FTS5 query — remove special characters that break MATCH syntax
    const sanitized = text
      .replace(/['"*(){}[\]:^~!@#$%&\\|<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitized) {
      return [];
    }

    // Truncate long queries to avoid FTS5 limits
    const queryText = sanitized.split(' ').slice(0, 20).join(' ');

    try {
      let sql = `
        SELECT
          c.id, c.source_type, c.source_file, c.project_path,
          c.chunk_index, c.heading, c.content, c.tags,
          c.importance, c.created_at, c.updated_at,
          bm25(chunks_fts) as score
        FROM chunks_fts
        JOIN chunks c ON chunks_fts.rowid = c.rowid
        WHERE chunks_fts MATCH ?
      `;

      const params: unknown[] = [queryText];

      if (sourceFile) {
        sql += ' AND c.source_file = ?';
        params.push(sourceFile);
      }

      sql += ' ORDER BY score LIMIT ?';
      params.push(maxResults);

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        source_type: string;
        source_file: string;
        project_path: string;
        chunk_index: number;
        heading: string | null;
        content: string;
        tags: string | null;
        importance: number;
        created_at: string;
        updated_at: string;
        score: number;
      }>;

      return rows.map((row) => ({
        chunk: {
          id: row.id,
          sourceType: row.source_type as KnowledgeChunk['sourceType'],
          sourceFile: row.source_file,
          projectPath: row.project_path,
          chunkIndex: row.chunk_index,
          heading: row.heading || undefined,
          content: row.content,
          tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
          importance: row.importance,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        score: row.score,
      }));
    } catch (error) {
      logger.warn('findSimilarChunks query failed:', error);
      return [];
    }
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

    // Get total count
    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as {
      count: number;
    };
    const total = totalResult.count;

    // Get embedded count (from separate embeddings table)
    const embeddedResult = this.db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
      count: number;
    };
    const embedded = embeddedResult.count;

    // Calculate pending
    const pending = total - embedded;

    return { total, embedded, pending };
  }

  /**
   * Get HyPE status for a project.
   * Returns the total number of chunks, how many have HyPE embeddings, and how many are pending.
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

    // Get total count
    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as {
      count: number;
    };
    const total = totalResult.count;

    // Get HyPE ready count (has hype_embeddings)
    const hypeReadyResult = this.db
      .prepare('SELECT COUNT(*) as count FROM chunks WHERE hype_embeddings IS NOT NULL')
      .get() as { count: number };
    const hype_ready = hypeReadyResult.count;

    // Calculate pending (has embeddings but no hype_embeddings)
    const pendingResult = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM chunks c
         WHERE EXISTS (SELECT 1 FROM embeddings WHERE embeddings.chunk_id = c.id)
           AND c.hype_embeddings IS NULL`
      )
      .get() as { count: number };
    const pending = pendingResult.count;

    return { total, hype_ready, pending };
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
    // Sanitize for FTS5 — strip operators that break MATCH syntax
    const sanitized = query
      .replace(/['"*(){}[\]:^~!@#$%&\\|<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sanitized) return [];

    const { results } = await this.search(projectPath, sanitized, {
      sourceTypes: ['reflection', 'agent_output'],
      maxResults,
      maxTokens: 3000,
    });

    return results;
  }
}
