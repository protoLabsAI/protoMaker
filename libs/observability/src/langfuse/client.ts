import { Langfuse } from 'langfuse';
import { createLogger } from '@automaker/utils';
import type { LangfuseConfig, CreateTraceOptions, CreateGenerationOptions } from './types.js';

const logger = createLogger('LangfuseClient');

/**
 * Wrapper around Langfuse SDK with fallback support
 */
export class LangfuseClient {
  private client: Langfuse | null = null;
  private enabled: boolean;
  private config: LangfuseConfig;

  constructor(config: LangfuseConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      flushAt: config.flushAt ?? 1,
      flushInterval: config.flushInterval ?? 1000,
      ...config,
    };

    this.enabled = this.config.enabled ?? false;

    if (this.enabled && config.publicKey && config.secretKey) {
      try {
        this.client = new Langfuse({
          publicKey: config.publicKey,
          secretKey: config.secretKey,
          baseUrl: config.baseUrl,
          flushAt: this.config.flushAt,
          flushInterval: this.config.flushInterval,
        });
        logger.info('Langfuse client initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Langfuse client:', error);
        this.enabled = false;
      }
    } else {
      logger.info('Langfuse client disabled or missing credentials');
      this.enabled = false;
    }
  }

  /**
   * Check if Langfuse is available and enabled
   */
  isAvailable(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Get a prompt from Langfuse by name and optional version
   */
  async getPrompt(name: string, version?: number): Promise<any | null> {
    if (!this.isAvailable()) {
      logger.debug(`Langfuse unavailable, cannot fetch prompt: ${name}`);
      return null;
    }

    try {
      const prompt = await this.client!.getPrompt(name, version);
      logger.debug(`Fetched prompt from Langfuse: ${name}`, { version });
      return prompt;
    } catch (error) {
      logger.error(`Failed to fetch prompt from Langfuse: ${name}`, error);
      return null;
    }
  }

  /**
   * Create a trace in Langfuse
   */
  createTrace(options: CreateTraceOptions) {
    if (!this.isAvailable()) {
      logger.debug('Langfuse unavailable, skipping trace creation');
      return null;
    }

    try {
      const trace = this.client!.trace({
        id: options.id,
        name: options.name,
        userId: options.userId,
        sessionId: options.sessionId,
        metadata: options.metadata,
        tags: options.tags,
      });
      logger.debug('Created trace in Langfuse', { traceId: options.id });
      return trace;
    } catch (error) {
      logger.error('Failed to create trace in Langfuse', error);
      return null;
    }
  }

  /**
   * Create a generation span in Langfuse
   */
  createGeneration(options: CreateGenerationOptions) {
    if (!this.isAvailable()) {
      logger.debug('Langfuse unavailable, skipping generation creation');
      return null;
    }

    try {
      const trace = this.client!.trace({ id: options.traceId });
      const generation = trace.generation({
        id: options.id,
        name: options.name,
        model: options.model,
        modelParameters: options.modelParameters,
        input: options.input,
        output: options.output,
        usage: options.usage,
        metadata: options.metadata,
        startTime: options.startTime,
        endTime: options.endTime,
      });
      logger.debug('Created generation in Langfuse', {
        traceId: options.traceId,
        generationId: options.id,
      });
      return generation;
    } catch (error) {
      logger.error('Failed to create generation in Langfuse', error);
      return null;
    }
  }

  /**
   * Flush pending events to Langfuse
   */
  async flush(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await this.client!.flushAsync();
      logger.debug('Flushed events to Langfuse');
    } catch (error) {
      logger.error('Failed to flush events to Langfuse', error);
    }
  }

  /**
   * Shutdown the client and flush remaining events
   */
  async shutdown(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await this.client!.shutdownAsync();
      logger.info('Langfuse client shutdown successfully');
    } catch (error) {
      logger.error('Failed to shutdown Langfuse client', error);
    }
  }
}
