/**
 * Knowledge Search Service
 *
 * Handles all search operations for the knowledge store, including BM25 full-text search,
 * hybrid retrieval with embeddings, and triple-mode fusion (BM25 + direct cosine + HyPE cosine).
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabs-ai/utils';
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeChunk,
  KnowledgeStoreSettings,
  RetrievalMode,
} from '@protolabs-ai/types';
import type { EmbeddingService } from './embedding-service.js';

const logger = createLogger('KnowledgeSearchService');

/**
 * Knowledge Search Service
 *
 * Provides search capabilities over the knowledge store using:
 * - BM25 full-text search (FTS5)
 * - Hybrid retrieval (BM25 + direct embeddings)
 * - Triple-mode fusion (BM25 + direct embeddings + HyPE embeddings) with RRF
 */
export class KnowledgeSearchService {
  private db: BetterSqlite3.Database;
  private embeddingService: EmbeddingService;
  private settings: KnowledgeStoreSettings;
  private projectPath: string;

  constructor(
    db: BetterSqlite3.Database,
    embeddingService: EmbeddingService,
    settings: KnowledgeStoreSettings,
    projectPath: string
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.settings = settings;
    this.projectPath = projectPath;
  }

  /**
   * Search the knowledge store using triple-mode fusion (BM25 + direct cosine + HyPE cosine with RRF)
   * Falls back to hybrid (BM25 + direct cosine) or pure BM25 if embeddings/HyPE unavailable.
   *
   * @param projectPath - Project path for evaluation logging
   * @param query - FTS5 query string (supports AND, OR, NOT, phrases)
   * @param opts - Search options (maxResults, maxTokens, sourceTypes)
   * @returns Object with results array and retrieval_mode
   */
  async search(
    projectPath: string,
    query: string,
    opts: KnowledgeSearchOptions = {}
  ): Promise<{ results: KnowledgeSearchResult[]; retrieval_mode: RetrievalMode }> {
    const { maxResults = 20, maxTokens = 8000, sourceTypes = 'all' } = opts;

    // Determine if we can use hybrid retrieval
    const canUseHybrid = this.settings.hybridRetrieval && this.embeddingService.isReady();

    let retrievalMode: RetrievalMode = 'bm25';

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

    // Step 2: If hybrid retrieval is enabled, compute RRF merge (triple-mode fusion if HyPE available)
    let rankedRows = rows;

    if (canUseHybrid && rows.length > 0) {
      try {
        // Embed the query
        const queryEmbedding = await this.embeddingService.embed(query);

        if (queryEmbedding) {
          // Load direct embeddings for candidates
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

          // Build a map of chunk_id -> direct embedding
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

          // Load HyPE embeddings for candidates (from chunks table)
          const hypeEmbeddingSql = `
            SELECT id, hype_embeddings
            FROM chunks
            WHERE id IN (${placeholders}) AND hype_embeddings IS NOT NULL
          `;

          const hypeEmbeddingRows = this.db.prepare(hypeEmbeddingSql).all(...chunkIds) as Array<{
            id: string;
            hype_embeddings: Buffer;
          }>;

          // Build a map of chunk_id -> HyPE embedding
          const hypeEmbeddingMap = new Map<string, Float32Array>();
          for (const row of hypeEmbeddingRows) {
            // Convert Buffer to Float32Array
            const floatArray = new Float32Array(
              row.hype_embeddings.buffer,
              row.hype_embeddings.byteOffset,
              row.hype_embeddings.byteLength / Float32Array.BYTES_PER_ELEMENT
            );
            hypeEmbeddingMap.set(row.id, floatArray);
          }

          // Compute cosine similarity for direct embeddings
          const directCosineSimilarities = new Map<string, number>();
          for (const row of rows) {
            const embedding = embeddingMap.get(row.id);
            if (embedding) {
              const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, embedding);
              directCosineSimilarities.set(row.id, similarity);
            }
          }

          // Compute cosine similarity for HyPE embeddings
          const hypeCosineSimilarities = new Map<string, number>();
          for (const row of rows) {
            const hypeEmbedding = hypeEmbeddingMap.get(row.id);
            if (hypeEmbedding) {
              const similarity = this.embeddingService.cosineSimilarity(
                queryEmbedding,
                hypeEmbedding
              );
              hypeCosineSimilarities.set(row.id, similarity);
            }
          }

          // Determine retrieval mode based on available embeddings
          const hasDirectEmbeddings = directCosineSimilarities.size > 0;
          const hasHypeEmbeddings = hypeCosineSimilarities.size > 0;

          if (hasDirectEmbeddings || hasHypeEmbeddings) {
            // Step 3: Rank by BM25 (ascending order - lower score is better)
            const bm25Ranked = [...rows].sort((a, b) => a.score - b.score);
            const bm25RankMap = new Map<string, number>();
            bm25Ranked.forEach((row, index) => {
              bm25RankMap.set(row.id, index + 1);
            });

            // Step 4: Rank by direct cosine similarity (descending - higher is better)
            const directCosineRanked = [...rows]
              .filter((r) => directCosineSimilarities.has(r.id))
              .sort((a, b) => {
                const simA = directCosineSimilarities.get(a.id) || 0;
                const simB = directCosineSimilarities.get(b.id) || 0;
                return simB - simA;
              });
            const directCosineRankMap = new Map<string, number>();
            directCosineRanked.forEach((row, index) => {
              directCosineRankMap.set(row.id, index + 1);
            });

            // Step 5: Rank by HyPE cosine similarity (descending - higher is better)
            const hypeRanked = [...rows]
              .filter((r) => hypeCosineSimilarities.has(r.id))
              .sort((a, b) => {
                const simA = hypeCosineSimilarities.get(a.id) || 0;
                const simB = hypeCosineSimilarities.get(b.id) || 0;
                return simB - simA;
              });
            const hypeRankMap = new Map<string, number>();
            hypeRanked.forEach((row, index) => {
              hypeRankMap.set(row.id, index + 1);
            });

            // Step 6: RRF merge with k=60, equal weights for all three modes
            const k = 60;
            const rrfScores = new Map<string, number>();

            for (const row of rows) {
              const bm25Rank = bm25RankMap.get(row.id) || rows.length + 1;
              const directCosineRank = directCosineRankMap.get(row.id) || rows.length + 1;
              const hypeRank = hypeRankMap.get(row.id) || rows.length + 1;

              let rrfScore = 1 / (k + bm25Rank);

              // Add direct cosine if available
              if (hasDirectEmbeddings) {
                rrfScore += 1 / (k + directCosineRank);
              }

              // Add HyPE cosine if available
              if (hasHypeEmbeddings) {
                rrfScore += 1 / (k + hypeRank);
              }

              rrfScores.set(row.id, rrfScore);
            }

            // Step 7: Sort by RRF score (higher is better)
            rankedRows = [...rows].sort((a, b) => {
              const scoreA = rrfScores.get(a.id) || 0;
              const scoreB = rrfScores.get(b.id) || 0;
              return scoreB - scoreA;
            });

            // Set retrieval mode based on what was used
            if (hasHypeEmbeddings) {
              retrievalMode = 'hybrid_hype';
              logger.info(
                `Triple-mode retrieval: ${directCosineSimilarities.size} direct, ${hypeCosineSimilarities.size} HyPE embeddings`
              );
            } else {
              retrievalMode = 'hybrid';
              logger.info(
                `Hybrid retrieval: ${directCosineSimilarities.size}/${rows.length} chunks with direct embeddings`
              );
            }
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

    // Log top-5 results for evaluation (append-only, rotate at 10k entries)
    void this.logEvaluation(projectPath, query, results.slice(0, 5), retrievalMode);

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
      logger.error('Error finding similar chunks:', error);
      return [];
    }
  }

  /**
   * Search for reflections and agent outputs using FTS5.
   *
   * @param projectPath - Project path
   * @param query - Search query
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

  /**
   * Log evaluation data for offline analysis.
   * Appends to .automaker/knowledge-eval.jsonl with rotation at 10k entries.
   *
   * @param projectPath - Project path
   * @param query - Search query
   * @param topResults - Top-5 results to log
   * @param retrievalMode - Retrieval mode used
   */
  private async logEvaluation(
    projectPath: string,
    query: string,
    topResults: KnowledgeSearchResult[],
    retrievalMode: RetrievalMode
  ): Promise<void> {
    try {
      const automakerDir = path.join(projectPath, '.automaker');
      const evalLogPath = path.join(automakerDir, 'knowledge-eval.jsonl');

      // Ensure directory exists
      if (!fs.existsSync(automakerDir)) {
        fs.mkdirSync(automakerDir, { recursive: true });
      }

      // Prepare log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        query,
        retrieval_mode: retrievalMode,
        top_results: topResults.map((r, index) => ({
          rank: index + 1,
          chunk_id: r.chunk.id,
          source_file: r.chunk.sourceFile,
          chunk_index: r.chunk.chunkIndex,
          source_type: r.chunk.sourceType,
          score: r.score,
        })),
      };

      // Append to log file
      fs.appendFileSync(evalLogPath, JSON.stringify(logEntry) + '\n');

      // Rotate if file exceeds 10k lines
      const stats = fs.statSync(evalLogPath);
      const lineCount = fs.readFileSync(evalLogPath, 'utf-8').split('\n').length;
      if (lineCount > 10000) {
        const backupPath = path.join(automakerDir, `knowledge-eval-${Date.now()}.jsonl`);
        fs.renameSync(evalLogPath, backupPath);
        logger.info(`Rotated eval log to ${backupPath}`);
      }
    } catch (error) {
      logger.warn('Failed to log evaluation data:', error);
    }
  }
}
