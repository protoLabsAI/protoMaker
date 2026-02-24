/**
 * Knowledge Store Service
 *
 * Persistent SQLite-based knowledge store for indexing and searching project documentation,
 * code, and context. Uses FTS5 for full-text search with WAL mode for concurrent reads.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@automaker/utils';
import type {
  KnowledgeStoreStats,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeChunk,
} from '@automaker/types';

const logger = createLogger('KnowledgeStoreService');

/**
 * Knowledge Store Service
 *
 * Manages a SQLite database with FTS5 full-text search for knowledge chunks.
 */
export class KnowledgeStoreService {
  private db: BetterSqlite3.Database | null = null;
  private projectPath: string | null = null;

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
   * Create the database schema (chunks table + FTS5 virtual table)
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
        updated_at TEXT NOT NULL
      )
    `);

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
        'file' | 'url' | 'manual' | 'generated',
        number
      >,
      lastUpdated,
      dbPath,
    };
  }

  /**
   * Search the knowledge store using FTS5 BM25 ranking
   *
   * @param projectPath - Project path to search within
   * @param query - FTS5 query string (supports AND, OR, NOT, phrases)
   * @param opts - Search options (maxResults, maxTokens, sourceTypes filter)
   * @returns Array of search results ordered by relevance score
   */
  search(
    projectPath: string,
    query: string,
    opts: KnowledgeSearchOptions = {}
  ): KnowledgeSearchResult[] {
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

    // Build the base SQL query with FTS5 BM25 ranking
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

    // Add source type filter if specified
    const params: unknown[] = [query];
    if (sourceTypes !== 'all' && sourceTypes.length > 0) {
      const placeholders = sourceTypes.map(() => '?').join(', ');
      sql += ` AND c.source_type IN (${placeholders})`;
      params.push(...sourceTypes);
    }

    // Order by BM25 score (lower is better in BM25)
    sql += ' ORDER BY score LIMIT ?';
    params.push(maxResults);

    logger.debug(`Executing FTS5 search: query="${query}", maxResults=${maxResults}`);

    // Execute the query
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

    // Apply token budget enforcement
    const results: KnowledgeSearchResult[] = [];
    let totalTokens = 0;

    for (const row of rows) {
      // Estimate tokens: ~4 chars per token
      const contentTokens = Math.ceil(row.content.length / 4);
      const headingTokens = row.heading ? Math.ceil(row.heading.length / 4) : 0;
      const chunkTokens = contentTokens + headingTokens;

      // Check if adding this chunk would exceed the budget
      if (totalTokens + chunkTokens > maxTokens) {
        logger.debug(
          `Token budget exhausted: ${totalTokens}/${maxTokens} tokens used, skipping ${rows.length - results.length} remaining chunks`
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
      `Search completed: ${results.length} chunks returned, ${totalTokens}/${maxTokens} tokens used`
    );

    return results;
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
}
