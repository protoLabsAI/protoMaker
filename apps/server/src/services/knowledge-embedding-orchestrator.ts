/**
 * Knowledge Embedding Orchestrator
 *
 * Orchestrates all embedding operations for the knowledge store:
 * - Background embedding generation for chunks
 * - HyPE (Hypothetical Phrase Embeddings) processing
 * - Embedding status tracking
 * - EmbeddingService lifecycle management
 */

import * as BetterSqlite3 from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@protolabs-ai/utils';
import { EmbeddingService } from './embedding-service.js';

const logger = createLogger('KnowledgeEmbeddingOrchestrator');

/**
 * Knowledge Embedding Orchestrator
 *
 * Manages all embedding operations and HyPE processing for the knowledge store.
 */
export class KnowledgeEmbeddingOrchestrator {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Get the embedding service instance
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  /**
   * Background worker to generate embeddings for chunks without them.
   * Runs asynchronously and non-blocking.
   */
  async runBackgroundEmbedding(db: BetterSqlite3.Database): Promise<void> {
    try {
      // Get chunks without embeddings (LEFT JOIN to find missing entries in embeddings table)
      const chunksToEmbed = db
        .prepare(
          `SELECT c.id, c.heading, c.content FROM chunks c
           LEFT JOIN embeddings e ON c.id = e.chunk_id
           WHERE e.chunk_id IS NULL`
        )
        .all() as Array<{ id: string; heading: string | null; content: string }>;

      if (chunksToEmbed.length === 0) {
        logger.debug('No chunks need embeddings');
        return;
      }

      logger.info(`Starting background embedding for ${chunksToEmbed.length} chunks`);

      // Process chunks one by one
      let processed = 0;
      for (const chunk of chunksToEmbed) {
        try {
          // Combine heading and content
          const text = chunk.heading ? `${chunk.heading} ${chunk.content}` : chunk.content;

          // Generate embedding
          const embedding = await this.embeddingService.embed(text);

          // Convert Float32Array to Buffer for BLOB storage
          const buffer = Buffer.from(embedding.buffer);

          // Insert or replace embedding in the embeddings table
          db.prepare(
            `INSERT OR REPLACE INTO embeddings (chunk_id, embedding, model, created_at)
             VALUES (?, ?, ?, datetime('now'))`
          ).run(chunk.id, buffer, 'all-MiniLM-L6-v2');

          processed++;

          // Log progress every 10 chunks
          if (processed % 10 === 0) {
            logger.debug(`Embedded ${processed}/${chunksToEmbed.length} chunks`);
          }
        } catch (error) {
          logger.warn(`Failed to embed chunk ${chunk.id}:`, error);
          // Continue with next chunk
        }
      }

      logger.info(
        `Background embedding completed: ${processed}/${chunksToEmbed.length} chunks embedded`
      );

      // Start HyPE background worker after embeddings complete
      void this.runBackgroundHype(db);
    } catch (error) {
      logger.error('Background embedding failed:', error);
    }
  }

  /**
   * Background worker to generate HyPE (Hypothetical Phrase Embeddings) for chunks.
   * Runs after embeddings are computed. Generates 3 short questions per chunk via Haiku,
   * embeds them, and stores the averaged embedding.
   * Rate-limited to 10 Haiku calls/minute to avoid API quota issues.
   */
  async runBackgroundHype(db: BetterSqlite3.Database): Promise<void> {
    try {
      // Get chunks with embeddings but no hype_queries
      const chunksToProcess = db
        .prepare(
          `SELECT c.id, c.heading, c.content FROM chunks c
           WHERE EXISTS (SELECT 1 FROM embeddings WHERE embeddings.chunk_id = c.id)
             AND c.hype_queries IS NULL`
        )
        .all() as Array<{ id: string; heading: string | null; content: string }>;

      if (chunksToProcess.length === 0) {
        logger.debug('No chunks need HyPE processing');
        return;
      }

      logger.info(`Starting background HyPE processing for ${chunksToProcess.length} chunks`);

      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      // Rate limiting: 10 calls per minute = 6 seconds between calls
      const RATE_LIMIT_DELAY_MS = 6000;
      let processed = 0;

      for (const chunk of chunksToProcess) {
        try {
          // Prepare text for Haiku (heading + first 500 chars of content)
          const text = chunk.heading
            ? `${chunk.heading} ${chunk.content.slice(0, 500)}`
            : chunk.content.slice(0, 500);

          // Call Haiku to generate 3 short questions
          const prompt = `Generate 3 short, specific questions that this text answers. Return only a JSON array of strings, no explanation. Text: ${text}`;

          const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          });

          // Parse the JSON response
          const responseText =
            message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';

          // Extract JSON array from response (handle potential markdown code blocks)
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          const questions: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

          if (questions.length === 0) {
            logger.warn(`No questions generated for chunk ${chunk.id}, skipping`);
            continue;
          }

          // Store the questions
          const questionsJson = JSON.stringify(questions);

          // Embed each question
          const queryEmbeddings = await this.embeddingService.embedBatch(questions);

          // Average the embeddings to create a single representative query embedding
          const avgEmbedding = this.averageEmbeddings(queryEmbeddings);

          // Convert Float32Array to Buffer for BLOB storage
          const buffer = Buffer.from(avgEmbedding.buffer);

          // Update chunk with hype_queries and hype_embeddings
          db.prepare('UPDATE chunks SET hype_queries = ?, hype_embeddings = ? WHERE id = ?').run(
            questionsJson,
            buffer,
            chunk.id
          );

          processed++;

          // Log progress every 10 chunks
          if (processed % 10 === 0) {
            logger.debug(`HyPE processed ${processed}/${chunksToProcess.length} chunks`);
          }

          // Rate limiting: wait 6 seconds between Haiku calls (10 calls/minute)
          if (processed < chunksToProcess.length) {
            await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
          }
        } catch (error) {
          logger.warn(`Failed to process HyPE for chunk ${chunk.id}:`, error);
          // Continue with next chunk
        }
      }

      logger.info(
        `Background HyPE processing completed: ${processed}/${chunksToProcess.length} chunks processed`
      );
    } catch (error) {
      logger.error('Background HyPE processing failed:', error);
    }
  }

  /**
   * Average multiple embedding vectors into a single representative vector.
   *
   * @param embeddings - Array of embedding vectors
   * @returns Averaged embedding vector
   */
  private averageEmbeddings(embeddings: Float32Array[]): Float32Array {
    if (embeddings.length === 0) {
      throw new Error('Cannot average empty array of embeddings');
    }

    const dimension = embeddings[0].length;
    const avgEmbedding = new Float32Array(dimension);

    // Sum all embeddings
    for (const embedding of embeddings) {
      for (let i = 0; i < dimension; i++) {
        avgEmbedding[i] += embedding[i];
      }
    }

    // Divide by count to get average
    for (let i = 0; i < dimension; i++) {
      avgEmbedding[i] /= embeddings.length;
    }

    return avgEmbedding;
  }

  /**
   * Get embedding status for a project.
   * Returns the total number of chunks, how many have embeddings, and how many are pending.
   *
   * @param db - Database instance
   * @returns Object with total, embedded, and pending counts
   */
  getEmbeddingStatus(db: BetterSqlite3.Database): {
    total: number;
    embedded: number;
    pending: number;
  } {
    // Get total count
    const totalResult = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as {
      count: number;
    };
    const total = totalResult.count;

    // Get embedded count (from separate embeddings table)
    const embeddedResult = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
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
   * @param db - Database instance
   * @returns Object with total, hype_ready, and pending counts
   */
  getHypeStatus(db: BetterSqlite3.Database): {
    total: number;
    hype_ready: number;
    pending: number;
  } {
    // Get total count
    const totalResult = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as {
      count: number;
    };
    const total = totalResult.count;

    // Get HyPE ready count (has hype_embeddings)
    const hypeReadyResult = db
      .prepare('SELECT COUNT(*) as count FROM chunks WHERE hype_embeddings IS NOT NULL')
      .get() as { count: number };
    const hype_ready = hypeReadyResult.count;

    // Calculate pending (has embeddings but no hype_embeddings)
    const pendingResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM chunks c
         WHERE EXISTS (SELECT 1 FROM embeddings WHERE embeddings.chunk_id = c.id)
           AND c.hype_embeddings IS NULL`
      )
      .get() as { count: number };
    const pending = pendingResult.count;

    return { total, hype_ready, pending };
  }
}
