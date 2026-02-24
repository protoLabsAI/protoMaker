/**
 * Knowledge Ingestion Service
 *
 * Handles all ingestion operations for the knowledge store:
 * - File ingestion (reflections, agent outputs)
 * - Background embedding generation
 * - HyPE (Hypothetical Phrase Embeddings) processing
 * - Category compaction
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as BetterSqlite3 from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@protolabs-ai/utils';
import { EmbeddingService } from './embedding-service.js';

const logger = createLogger('KnowledgeIngestionService');

/**
 * Knowledge Ingestion Service
 *
 * Manages all ingestion operations for the knowledge store.
 */
export class KnowledgeIngestionService {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Rebuild the FTS5 index by re-scanning project files.
   * Called after learning appends to make new content immediately searchable.
   *
   * @param db - Database instance
   * @param projectPath - Project path to rebuild index for
   */
  rebuildIndex(db: BetterSqlite3.Database, projectPath: string): void {
    try {
      // Rebuild FTS5 index from chunks table
      db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
      logger.debug('FTS5 index rebuilt successfully');

      // Start background embedding worker (non-blocking)
      void this.runBackgroundEmbedding(db);
    } catch (error) {
      logger.warn('Failed to rebuild FTS5 index:', error);
    }
  }

  /**
   * Background worker to generate embeddings for chunks without them.
   * Runs asynchronously and non-blocking.
   */
  private async runBackgroundEmbedding(db: BetterSqlite3.Database): Promise<void> {
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
  private async runBackgroundHype(db: BetterSqlite3.Database): Promise<void> {
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
   * Compact a category file if it exceeds the token threshold.
   * Counts tokens (content length / 4), and if over threshold, uses Haiku to summarize.
   */
  async compactCategory(
    projectPath: string,
    categoryFile: string,
    compactionThreshold: number = 50000
  ): Promise<void> {
    const memoryDir = path.join(projectPath, '.automaker', 'memory');
    const categoryPath = path.join(memoryDir, categoryFile);

    if (!fs.existsSync(categoryPath)) {
      logger.debug(`Category file ${categoryFile} does not exist, skipping compaction`);
      return;
    }

    const content = fs.readFileSync(categoryPath, 'utf-8');
    const estimatedTokens = Math.ceil(content.length / 4);

    logger.debug(
      `Category ${categoryFile}: ${estimatedTokens} tokens (threshold: ${compactionThreshold})`
    );

    if (estimatedTokens <= compactionThreshold) {
      return;
    }

    logger.info(
      `Category ${categoryFile} exceeds threshold (${estimatedTokens} > ${compactionThreshold}), compacting...`
    );

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `You are summarizing a category memory file that has grown too large. Your task is to compress the content while preserving the most important patterns, decisions, and lessons.

# Original Content:
${content}

# Instructions:
1. Preserve all critical information (architectural decisions, gotchas, patterns)
2. Remove redundant or less important details
3. Keep the YAML frontmatter intact
4. Maintain the markdown structure
5. Aim to reduce size by at least 30% while preserving value

Output the compressed memory file:`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const summarizedContent =
      message.content[0].type === 'text' ? message.content[0].text : content;

    fs.writeFileSync(categoryPath, summarizedContent, 'utf-8');
    logger.info(`Category ${categoryFile} compacted successfully`);
  }

  /**
   * Ingest reflection.md files from all features in the project.
   * Scans all .automaker/features/ directories and indexes reflection.md content.
   *
   * @param db - Database instance
   * @param projectPath - Project path to scan
   * @returns Number of reflections indexed
   */
  async ingestReflections(db: BetterSqlite3.Database, projectPath: string): Promise<number> {
    const featuresDir = path.join(projectPath, '.automaker', 'features');
    if (!fs.existsSync(featuresDir)) {
      logger.debug('No features directory found, skipping reflection ingestion');
      return 0;
    }

    const featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true });
    let indexedCount = 0;

    for (const dir of featureDirs) {
      if (!dir.isDirectory()) continue;

      const reflectionPath = path.join(featuresDir, dir.name, 'reflection.md');
      if (!fs.existsSync(reflectionPath)) continue;

      try {
        const content = await fs.promises.readFile(reflectionPath, 'utf-8');
        if (!content.trim()) continue;

        // Extract feature ID from directory name
        const featureId = dir.name;
        const timestamp = new Date().toISOString();

        // Create chunk ID
        const chunkId = `reflection-${featureId}`;

        // Check if chunk already exists
        const existing = db.prepare('SELECT id FROM chunks WHERE id = ?').get(chunkId);

        if (existing) {
          // Update existing chunk
          db.prepare(
            `
            UPDATE chunks
            SET content = ?, updated_at = ?
            WHERE id = ?
          `
          ).run(content.trim(), timestamp, chunkId);
        } else {
          // Insert new chunk
          db.prepare(
            `
            INSERT INTO chunks (id, source_type, source_file, project_path, chunk_index, heading, content, tags, importance, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            chunkId,
            'reflection',
            `.automaker/features/${featureId}/reflection.md`,
            projectPath,
            0,
            `Reflection: ${featureId}`,
            content.trim(),
            JSON.stringify(['reflection', featureId]),
            0.8, // Higher importance for reflections
            timestamp,
            timestamp
          );
        }

        indexedCount++;
      } catch (err) {
        logger.warn(`Failed to index reflection for ${dir.name}:`, err);
      }
    }

    logger.info(`Indexed ${indexedCount} reflections from ${projectPath}`);
    return indexedCount;
  }

  /**
   * Ingest agent-output.md files from all features in the project.
   * Indexes the last 2000 characters (summary section) of each agent-output.md.
   *
   * @param db - Database instance
   * @param projectPath - Project path to scan
   * @returns Number of agent outputs indexed
   */
  async ingestAgentOutputs(db: BetterSqlite3.Database, projectPath: string): Promise<number> {
    const featuresDir = path.join(projectPath, '.automaker', 'features');
    if (!fs.existsSync(featuresDir)) {
      logger.debug('No features directory found, skipping agent output ingestion');
      return 0;
    }

    const featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true });
    let indexedCount = 0;

    for (const dir of featureDirs) {
      if (!dir.isDirectory()) continue;

      const agentOutputPath = path.join(featuresDir, dir.name, 'agent-output.md');
      if (!fs.existsSync(agentOutputPath)) continue;

      try {
        const fullContent = await fs.promises.readFile(agentOutputPath, 'utf-8');
        if (!fullContent.trim()) continue;

        // Extract last 2000 characters (summary section)
        const content = fullContent.length > 2000 ? fullContent.slice(-2000) : fullContent;

        // Extract feature ID from directory name
        const featureId = dir.name;
        const timestamp = new Date().toISOString();

        // Create chunk ID
        const chunkId = `agent-output-${featureId}`;

        // Check if chunk already exists
        const existing = db.prepare('SELECT id FROM chunks WHERE id = ?').get(chunkId);

        if (existing) {
          // Update existing chunk
          db.prepare(
            `
            UPDATE chunks
            SET content = ?, updated_at = ?
            WHERE id = ?
          `
          ).run(content.trim(), timestamp, chunkId);
        } else {
          // Insert new chunk
          db.prepare(
            `
            INSERT INTO chunks (id, source_type, source_file, project_path, chunk_index, heading, content, tags, importance, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            chunkId,
            'agent_output',
            `.automaker/features/${featureId}/agent-output.md`,
            projectPath,
            0,
            `Agent Output: ${featureId}`,
            content.trim(),
            JSON.stringify(['agent_output', featureId]),
            0.6, // Medium importance for agent outputs
            timestamp,
            timestamp
          );
        }

        indexedCount++;
      } catch (err) {
        logger.warn(`Failed to index agent output for ${dir.name}:`, err);
      }
    }

    logger.info(`Indexed ${indexedCount} agent outputs from ${projectPath}`);
    return indexedCount;
  }
}
