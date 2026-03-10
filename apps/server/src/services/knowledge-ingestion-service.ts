/**
 * Knowledge Ingestion Service
 *
 * Handles file ingestion operations for the knowledge store:
 * - File ingestion (reflections, agent outputs)
 * - Category compaction
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as BetterSqlite3 from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@protolabsai/utils';
import { KnowledgeEmbeddingOrchestrator } from './knowledge-embedding-orchestrator.js';

const logger = createLogger('KnowledgeIngestionService');

/**
 * Knowledge Ingestion Service
 *
 * Manages file ingestion operations for the knowledge store.
 */
export class KnowledgeIngestionService {
  private embeddingOrchestrator: KnowledgeEmbeddingOrchestrator;

  constructor(embeddingOrchestrator?: KnowledgeEmbeddingOrchestrator) {
    this.embeddingOrchestrator = embeddingOrchestrator || new KnowledgeEmbeddingOrchestrator();
  }

  /**
   * Rebuild the FTS5 index by re-scanning project files.
   * Called after learning appends to make new content immediately searchable.
   *
   * @param db - Database instance
   * @param projectPath - Project path to rebuild index for
   */
  rebuildIndex(db: BetterSqlite3.Database, _projectPath: string): void {
    try {
      // Rebuild FTS5 index from chunks table
      db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
      logger.debug('FTS5 index rebuilt successfully');

      // Start background embedding worker (non-blocking)
      void this.embeddingOrchestrator.runBackgroundEmbedding(db);
    } catch (error) {
      logger.warn('Failed to rebuild FTS5 index:', error);
    }
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
            JSON.stringify(['reflection', 'engineering', featureId]),
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
            JSON.stringify(['agent_output', 'engineering', featureId]),
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

  /**
   * Ingest engineering learnings when a feature reaches DONE state.
   * Extracts and indexes agent-output.md, reflection.md, and failure classification
   * data from feature.json. All chunks are tagged with domain='engineering'.
   *
   * @param db - Database instance
   * @param projectPath - Project path
   * @param featureId - Feature ID that just completed
   * @returns Number of chunks indexed
   */
  async ingestFeatureCompletionLearnings(
    db: BetterSqlite3.Database,
    projectPath: string,
    featureId: string
  ): Promise<number> {
    const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
    if (!fs.existsSync(featureDir)) {
      logger.debug(`Feature directory not found for ${featureId}, skipping ingestion`);
      return 0;
    }

    let indexedCount = 0;
    const timestamp = new Date().toISOString();

    // 1. Ingest agent-output.md (last 2000 chars — the summary section)
    const agentOutputPath = path.join(featureDir, 'agent-output.md');
    if (fs.existsSync(agentOutputPath)) {
      try {
        const fullContent = await fs.promises.readFile(agentOutputPath, 'utf-8');
        if (fullContent.trim()) {
          const content = fullContent.length > 2000 ? fullContent.slice(-2000) : fullContent;
          this.upsertChunk(db, {
            chunkId: `completion-agent-output-${featureId}`,
            sourceType: 'agent_output',
            sourceFile: `.automaker/features/${featureId}/agent-output.md`,
            projectPath,
            heading: `Agent Output: ${featureId}`,
            content: content.trim(),
            tags: JSON.stringify(['agent_output', 'engineering', featureId]),
            importance: 0.7,
            timestamp,
          });
          indexedCount++;
        }
      } catch (err) {
        logger.warn(`Failed to ingest agent-output for ${featureId}:`, err);
      }
    }

    // 2. Ingest reflection.md (generated during DEPLOY phase)
    const reflectionPath = path.join(featureDir, 'reflection.md');
    if (fs.existsSync(reflectionPath)) {
      try {
        const content = await fs.promises.readFile(reflectionPath, 'utf-8');
        if (content.trim()) {
          this.upsertChunk(db, {
            chunkId: `completion-reflection-${featureId}`,
            sourceType: 'reflection',
            sourceFile: `.automaker/features/${featureId}/reflection.md`,
            projectPath,
            heading: `Reflection: ${featureId}`,
            content: content.trim(),
            tags: JSON.stringify(['reflection', 'engineering', featureId]),
            importance: 0.85,
            timestamp,
          });
          indexedCount++;
        }
      } catch (err) {
        logger.warn(`Failed to ingest reflection for ${featureId}:`, err);
      }
    }

    // 3. Extract failure patterns and PR feedback from feature.json
    const featureJsonPath = path.join(featureDir, 'feature.json');
    if (fs.existsSync(featureJsonPath)) {
      try {
        const raw = await fs.promises.readFile(featureJsonPath, 'utf-8');
        const feature = JSON.parse(raw) as Record<string, unknown>;
        const failureLines: string[] = [];
        const featureTitle = (feature.title as string | undefined) ?? featureId;

        // Extract structured failure classification (set by EscalateProcessor)
        if (feature.failureClassification) {
          const fc = feature.failureClassification as {
            category: string;
            confidence: number;
            recoveryStrategy: { type: string; [key: string]: unknown };
            retryable: boolean;
            timestamp: string;
          };
          failureLines.push(
            `## Failure Classification`,
            `- Category: ${fc.category}`,
            `- Confidence: ${fc.confidence}`,
            `- Recovery strategy: ${fc.recoveryStrategy.type}`,
            `- Retryable: ${fc.retryable}`,
            `- Classified at: ${fc.timestamp}`
          );
        }

        // Extract retry/failure counts
        if (feature.retryCount != null || feature.failureCount != null) {
          failureLines.push(
            `## Failure Counts`,
            `- Retry count: ${feature.retryCount ?? 0}`,
            `- Failure count: ${feature.failureCount ?? 0}`
          );
        }

        // Extract PR feedback from status history (transitions to/from review)
        if (Array.isArray(feature.statusHistory)) {
          const reviewTransitions = (
            feature.statusHistory as Array<{ from: string | null; to: string; reason?: string }>
          ).filter((h) => h.from === 'review' || h.to === 'review');

          if (reviewTransitions.length > 0) {
            failureLines.push(`## PR Review History`);
            for (const t of reviewTransitions) {
              const reason = t.reason ? ` — ${t.reason}` : '';
              failureLines.push(`- ${t.from ?? 'null'} → ${t.to}${reason}`);
            }
          }
        }

        if (failureLines.length > 0) {
          const content = `# Engineering Learnings: ${featureTitle}\n\n${failureLines.join('\n')}`;
          this.upsertChunk(db, {
            chunkId: `completion-failure-${featureId}`,
            sourceType: 'reflection',
            sourceFile: `.automaker/features/${featureId}/feature.json`,
            projectPath,
            heading: `Failure Patterns: ${featureTitle}`,
            content,
            tags: JSON.stringify(['failure_pattern', 'engineering', featureId]),
            importance: 0.9,
            timestamp,
          });
          indexedCount++;
        }
      } catch (err) {
        logger.warn(`Failed to extract failure patterns for ${featureId}:`, err);
      }
    }

    if (indexedCount > 0) {
      this.rebuildIndex(db, projectPath);
      logger.info(`Indexed ${indexedCount} completion learnings for feature ${featureId}`);
    }

    return indexedCount;
  }

  /**
   * Upsert a chunk into the database (insert if new, update if existing).
   *
   * @param db - Database instance
   * @param opts - Chunk fields
   */
  private upsertChunk(
    db: BetterSqlite3.Database,
    opts: {
      chunkId: string;
      sourceType: string;
      sourceFile: string;
      projectPath: string;
      heading: string;
      content: string;
      tags: string;
      importance: number;
      timestamp: string;
    }
  ): void {
    const existing = db.prepare('SELECT id FROM chunks WHERE id = ?').get(opts.chunkId);
    if (existing) {
      db.prepare('UPDATE chunks SET content = ?, tags = ?, updated_at = ? WHERE id = ?').run(
        opts.content,
        opts.tags,
        opts.timestamp,
        opts.chunkId
      );
    } else {
      db.prepare(
        `INSERT INTO chunks (id, source_type, source_file, project_path, chunk_index, heading, content, tags, importance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        opts.chunkId,
        opts.sourceType,
        opts.sourceFile,
        opts.projectPath,
        0,
        opts.heading,
        opts.content,
        opts.tags,
        opts.importance,
        opts.timestamp,
        opts.timestamp
      );
    }
  }
}
