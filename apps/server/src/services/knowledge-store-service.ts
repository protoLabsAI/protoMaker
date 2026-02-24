/**
 * Knowledge Store Service
 *
 * Persistent SQLite-based knowledge store for indexing and searching project documentation,
 * code, and context. Uses FTS5 for full-text search with WAL mode for concurrent reads.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import Database from 'better-sqlite3';
import { watch, type FSWatcher } from 'node:fs';
import { createLogger, chunkMarkdownFile } from '@automaker/utils';
import type { KnowledgeStoreStats } from '@automaker/types';
import { randomUUID } from 'node:crypto';

const logger = createLogger('KnowledgeStoreService');

/**
 * Knowledge Store Service
 *
 * Manages a SQLite database with FTS5 full-text search for knowledge chunks.
 */
export class KnowledgeStoreService {
  private db: Database.Database | null = null;
  private projectPath: string | null = null;
  private watcher: FSWatcher | null = null;
  private rebuildDebounceTimer: NodeJS.Timeout | null = null;

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
    this.db = new Database(dbPath);

    // Enable WAL mode
    this.db.pragma('journal_mode = WAL');

    // Create schema
    this.createSchema();

    // Setup file watcher
    this.setupFileWatcher();

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
   * Setup file watcher for .automaker/memory/*.md files
   * Triggers rebuildIndex debounced 2s after any write
   */
  private setupFileWatcher(): void {
    if (!this.projectPath) {
      throw new Error('Project path not set');
    }

    const memoryDir = path.join(this.projectPath, '.automaker', 'memory');

    // Ensure memory directory exists
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // Watch for changes
    this.watcher = watch(
      memoryDir,
      { recursive: true },
      (eventType: string, filename: string | null) => {
        if (!filename || !filename.endsWith('.md')) {
          return;
        }

        logger.debug(`File watcher detected ${eventType} on ${filename}`);

        // Debounce rebuild - clear existing timer and set new one
        if (this.rebuildDebounceTimer) {
          clearTimeout(this.rebuildDebounceTimer);
        }

        this.rebuildDebounceTimer = setTimeout(() => {
          if (this.projectPath) {
            logger.info('File watcher triggering knowledge store rebuild');
            this.rebuildIndex(this.projectPath);
          }
        }, 2000);
      }
    );

    logger.debug('File watcher setup for memory directory');
  }

  /**
   * Upsert chunks for a source file
   * Uses INSERT OR REPLACE on (source_file, chunk_index)
   */
  private upsertChunks(
    sourceType: 'file' | 'url' | 'manual' | 'generated',
    sourceFile: string,
    chunks: Array<{
      heading?: string;
      content: string;
      chunkIndex: number;
      tags?: string[];
      importance?: number;
    }>
  ): void {
    if (!this.db || !this.projectPath) {
      throw new Error('Knowledge store not initialized');
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (
        id, source_type, source_file, project_path, chunk_index,
        heading, content, tags, importance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    for (const chunk of chunks) {
      const id = randomUUID();
      const tagsJson = chunk.tags ? JSON.stringify(chunk.tags) : null;
      const importance = chunk.importance ?? 0.5;

      stmt.run(
        id,
        sourceType,
        sourceFile,
        this.projectPath,
        chunk.chunkIndex,
        chunk.heading || null,
        chunk.content,
        tagsJson,
        importance,
        now,
        now
      );
    }

    logger.debug(`Upserted ${chunks.length} chunks for ${sourceFile}`);
  }

  /**
   * Ingest all .md files from .automaker/memory/
   */
  ingestMemoryFiles(projectPath: string): void {
    const memoryDir = path.join(projectPath, '.automaker', 'memory');

    if (!fs.existsSync(memoryDir)) {
      logger.warn(`Memory directory does not exist: ${memoryDir}`);
      return;
    }

    const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith('.md'));

    logger.info(`Ingesting ${files.length} memory files from ${memoryDir}`);

    for (const file of files) {
      const filePath = path.join(memoryDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const chunks = chunkMarkdownFile(content);

      const relativeFile = path.relative(projectPath, filePath);
      this.upsertChunks('file', relativeFile, chunks);
    }

    logger.info(`Memory files ingested successfully`);
  }

  /**
   * Ingest all .md files from .automaker/context/
   */
  ingestContextFiles(projectPath: string): void {
    const contextDir = path.join(projectPath, '.automaker', 'context');

    if (!fs.existsSync(contextDir)) {
      logger.warn(`Context directory does not exist: ${contextDir}`);
      return;
    }

    const files = fs.readdirSync(contextDir).filter((f) => f.endsWith('.md'));

    logger.info(`Ingesting ${files.length} context files from ${contextDir}`);

    for (const file of files) {
      const filePath = path.join(contextDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const chunks = chunkMarkdownFile(content);

      const relativeFile = path.relative(projectPath, filePath);
      this.upsertChunks('file', relativeFile, chunks);
    }

    logger.info(`Context files ingested successfully`);
  }

  /**
   * Ingest all .automaker/features/{id}/reflection.md files
   */
  ingestReflections(projectPath: string): void {
    const featuresDir = path.join(projectPath, '.automaker', 'features');

    if (!fs.existsSync(featuresDir)) {
      logger.warn(`Features directory does not exist: ${featuresDir}`);
      return;
    }

    const featureDirs = fs
      .readdirSync(featuresDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    let reflectionCount = 0;

    for (const featureId of featureDirs) {
      const reflectionPath = path.join(featuresDir, featureId, 'reflection.md');

      if (fs.existsSync(reflectionPath)) {
        const content = fs.readFileSync(reflectionPath, 'utf-8');
        const chunks = chunkMarkdownFile(content);

        const relativeFile = path.relative(projectPath, reflectionPath);
        this.upsertChunks('file', relativeFile, chunks);

        reflectionCount++;
      }
    }

    logger.info(`Ingested ${reflectionCount} reflection files`);
  }

  /**
   * Clear all chunks and re-ingest all sources
   */
  rebuildIndex(projectPath: string): void {
    if (!this.db) {
      throw new Error('Knowledge store not initialized');
    }

    logger.info('Rebuilding knowledge store index');

    // Clear all chunks
    this.db.exec('DELETE FROM chunks');

    // Re-ingest all sources
    this.ingestMemoryFiles(projectPath);
    this.ingestContextFiles(projectPath);
    this.ingestReflections(projectPath);

    logger.info('Knowledge store index rebuilt successfully');
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
   * Close the database connection and file watcher
   */
  close(): void {
    if (this.rebuildDebounceTimer) {
      clearTimeout(this.rebuildDebounceTimer);
      this.rebuildDebounceTimer = null;
    }

    if (this.watcher) {
      logger.debug('Closing file watcher');
      this.watcher.close();
      this.watcher = null;
    }

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
  getDatabase(): Database.Database | null {
    return this.db;
  }
}
