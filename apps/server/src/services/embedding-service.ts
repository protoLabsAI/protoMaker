/**
 * EmbeddingService
 *
 * Generates semantic embeddings using Xenova/transformers.js with the all-MiniLM-L6-v2 model.
 * Model is lazy-loaded on first use and cached to DATA_DIR/models/ for persistence across restarts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { createLogger } from '@protolabs-ai/utils';
import type { FeatureExtractionPipeline } from '@xenova/transformers';

const logger = createLogger('EmbeddingService');

export class EmbeddingService extends EventEmitter {
  private pipeline: FeatureExtractionPipeline | null = null;
  private isLoading = false;
  private requestQueue: Array<{
    text: string;
    resolve: (embedding: Float32Array) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(
    private readonly modelName: string = 'Xenova/all-MiniLM-L6-v2',
    private readonly cacheDir: string = path.join(process.env.DATA_DIR || './data', 'models')
  ) {
    super();
  }

  /**
   * Lazy-load the embedding model.
   * Model is cached to disk for persistence across restarts.
   */
  private async loadModel(): Promise<void> {
    if (this.pipeline) {
      return;
    }

    if (this.isLoading) {
      // Wait for the current loading operation to complete
      return new Promise((resolve, reject) => {
        this.once('ready', resolve);
        this.once('error', reject);
      });
    }

    this.isLoading = true;
    logger.info(`Loading embedding model: ${this.modelName}`);

    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      // Dynamically import transformers.js (ESM only)
      const { pipeline, env } = await import('@xenova/transformers');

      // Set cache directory
      env.cacheDir = this.cacheDir;

      // Load the model
      this.pipeline = (await pipeline(
        'feature-extraction',
        this.modelName
      )) as FeatureExtractionPipeline;

      logger.info(`Embedding model loaded successfully (cached to ${this.cacheDir})`);
      this.isLoading = false;
      this.emit('ready');

      // Process any queued requests
      await this.processQueue();
    } catch (error) {
      logger.error('Failed to load embedding model:', error);
      this.isLoading = false;
      this.emit('error', error);

      // Reject all queued requests
      for (const request of this.requestQueue) {
        request.reject(
          error instanceof Error ? error : new Error('Failed to load embedding model')
        );
      }
      this.requestQueue = [];

      throw error;
    }
  }

  /**
   * Process queued embedding requests after model loads.
   */
  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (!request) continue;

      try {
        const embedding = await this.embedNow(request.text);
        request.resolve(embedding);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error('Embedding failed'));
      }
    }
  }

  /**
   * Generate an embedding for a single text string.
   * If the model is not loaded, the request will be queued until the model is ready.
   *
   * @param text - Text to embed
   * @returns Float32Array embedding vector
   */
  async embed(text: string): Promise<Float32Array> {
    if (!this.pipeline) {
      // Queue the request and start loading the model
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ text, resolve, reject });
        void this.loadModel();
      });
    }

    return this.embedNow(text);
  }

  /**
   * Generate an embedding immediately (assumes model is loaded).
   */
  private async embedNow(text: string): Promise<Float32Array> {
    if (!this.pipeline) {
      throw new Error('Embedding model not loaded');
    }

    try {
      // Run the model
      const result = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the Float32Array from the result
      const embedding = result.data as Float32Array;

      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch.
   *
   * @param texts - Array of texts to embed
   * @returns Array of Float32Array embedding vectors
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.pipeline) {
      await this.loadModel();
    }

    const embeddings: Float32Array[] = [];

    for (const text of texts) {
      const embedding = await this.embedNow(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Calculate cosine similarity between two embedding vectors.
   *
   * @param a - First embedding vector
   * @param b - Second embedding vector
   * @returns Cosine similarity (1.0 = identical, 0.0 = orthogonal, -1.0 = opposite)
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Embedding vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

    return similarity;
  }

  /**
   * Check if the model is ready.
   */
  isReady(): boolean {
    return this.pipeline !== null;
  }
}
