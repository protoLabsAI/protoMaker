/**
 * Knowledge Search Service
 *
 * Handles all search operations for the knowledge store, including:
 * - BM25 FTS5 full-text search
 * - Cosine similarity vector search
 * - RRF (Reciprocal Rank Fusion) hybrid retrieval
 * - Token budget enforcement
 * - Search result ranking and filtering
 */

import type * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabs-ai/utils';
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeChunk,
} from '@protolabs-ai/types';
import { EmbeddingService } from './embedding-service.js';

const logger = createLogger('KnowledgeSearchService');

export class KnowledgeSearchService {
  private embeddingService: EmbeddingService;
  private hybridRetrievalEnabled: boolean;

  constructor(embeddingService?: EmbeddingService, hybridRetrievalEnabled: boolean = true) {
    this.embeddingService = embeddingService || new EmbeddingService();
    this.hybridRetrievalEnabled = hybridRetrievalEnabled;
  }

  /**
   * Search the knowledge store using hybrid retrieval (BM25 + cosine similarity with RRF)
   * Falls back to pure BM25 if embeddings are unavailable.
   *
   * @param db - Better-sqlite3 database instance
   * @param projectPath - Project path to search within
   * @param query - FTS5 query string (supports AND, OR, NOT, phrases)
   * @param opts - Search options (maxResults, maxTokens, sourceTypes filter)
   * @returns Object with results array and retrieval_mode
   */
  async search(
    db: BetterSqlite3.Database,
    projectPath: string,
    query: string,
    opts: KnowledgeSearchOptions = {}
  ): Promise<{ results: KnowledgeSearchResult[]; retrieval_mode: 'hybrid' | 'bm25' }> {
    const { maxResults = 20, maxTokens = 8000, sourceTypes = 'all' } = opts;

    // Determine if we can use hybrid retrieval
    const canUseHybrid = this.hybridRetrievalEnabled && this.embeddingService.isReady();

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

    const stmt = db.prepare(sql);
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

          const embeddingRows = db.prepare(embeddingSql).all(...chunkIds) as Array<{
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
      db.prepare(updateSql).run(...chunkIds);
      logger.debug(`Updated usage tracking for ${chunkIds.length} chunks`);
    }

    return { results, retrieval_mode: retrievalMode };
  }

  /**
   * Search for reflections and agent outputs using FTS5.
   * Convenience method that filters to reflection and agent_output source types.
   *
   * @param db - Better-sqlite3 database instance
   * @param projectPath - Project path
   * @param query - Search query (feature title + description works well)
   * @param maxResults - Maximum number of results (default: 5)
   * @returns Array of search results with relevance scores
   */
  async searchReflections(
    db: BetterSqlite3.Database,
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

    const { results } = await this.search(db, projectPath, sanitized, {
      sourceTypes: ['reflection', 'agent_output'],
      maxResults,
      maxTokens: 3000,
    });

    return results;
  }

  /**
   * Enable or disable hybrid retrieval mode
   *
   * @param enabled - Whether to enable hybrid retrieval
   */
  setHybridRetrieval(enabled: boolean): void {
    this.hybridRetrievalEnabled = enabled;
  }

  /**
   * Check if hybrid retrieval is available
   *
   * @returns True if hybrid retrieval is enabled and embeddings are ready
   */
  isHybridRetrievalAvailable(): boolean {
    return this.hybridRetrievalEnabled && this.embeddingService.isReady();
  }
}
