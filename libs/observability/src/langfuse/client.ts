import { Langfuse } from 'langfuse';
import { createLogger } from '@automaker/utils';
import type {
  LangfuseConfig,
  CreateTraceOptions,
  CreateGenerationOptions,
  CreateSpanOptions,
  CreateScoreOptions,
} from './types.js';

const logger = createLogger('LangfuseClient');

// Configure SDK logger to reduce noise from expected errors (e.g., prompt not found)
// This runs once at module load time
(async () => {
  try {
    // Import dynamically to handle cases where @langfuse/core isn't available as direct dep
    const { configureGlobalLogger, LogLevel } = await import('@langfuse/core');
    configureGlobalLogger({ level: LogLevel.ERROR });
    logger.debug('Langfuse SDK global logger configured to ERROR level');
  } catch (error) {
    // Silently fail if @langfuse/core is not available - not critical
    logger.debug('Could not configure Langfuse SDK logger (package not available)');
  }
})();

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
   * Get a prompt from Langfuse by name and optional version/label.
   * Returns a Langfuse prompt object with `prompt`, `version`, and `config` properties.
   *
   * @param name - Prompt name in Langfuse
   * @param version - Optional specific version number
   * @param options - Optional settings (label for environment pinning, e.g. "production")
   */
  async getPrompt(
    name: string,
    version?: number,
    options?: { label?: string }
  ): Promise<{ prompt: string; version: number; config?: Record<string, any> } | null> {
    if (!this.isAvailable()) {
      logger.debug(`Langfuse unavailable, cannot fetch prompt: ${name}`);
      return null;
    }

    try {
      const prompt = await this.client!.getPrompt(
        name,
        version,
        options?.label ? { label: options.label } : undefined
      );
      logger.debug(`Fetched prompt from Langfuse: ${name}`, { version, label: options?.label });
      return {
        prompt: prompt.prompt as string,
        version: prompt.version,
        config: prompt.config as Record<string, any> | undefined,
      };
    } catch (error) {
      // "Prompt not found" is expected when prompts haven't been seeded to Langfuse —
      // the three-layer resolver falls back to hardcoded defaults gracefully.
      const isNotFound = error instanceof Error && error.message.includes('Prompt not found');
      if (isNotFound) {
        logger.debug(`Prompt not in Langfuse: ${name} (will use default)`);
      } else {
        logger.error(`Failed to fetch prompt from Langfuse: ${name}`, error);
      }
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
        input: options.input,
        output: options.output,
      });
      logger.debug('Created trace in Langfuse', { traceId: options.id });
      return trace;
    } catch (error) {
      logger.error('Failed to create trace in Langfuse', error);
      return null;
    }
  }

  /**
   * Update an existing trace with new data (e.g., input/output after execution)
   */
  updateTrace(
    traceId: string,
    data: { input?: any; output?: any; metadata?: Record<string, any> }
  ) {
    if (!this.isAvailable()) return;
    try {
      const trace = this.client!.trace({ id: traceId });
      trace.update(data);
      logger.debug('Updated trace in Langfuse', { traceId });
    } catch (error) {
      logger.error('Failed to update trace in Langfuse', error);
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
   * Create a span within a trace
   */
  createSpan(options: CreateSpanOptions) {
    if (!this.isAvailable()) {
      logger.debug('Langfuse unavailable, skipping span creation');
      return null;
    }

    try {
      const trace = this.client!.trace({ id: options.traceId });
      const span = trace.span({
        id: options.id,
        name: options.name,
        input: options.input,
        output: options.output,
        metadata: options.metadata,
        startTime: options.startTime,
        endTime: options.endTime,
      });
      logger.debug('Created span in Langfuse', {
        traceId: options.traceId,
        spanId: options.id,
      });
      return span;
    } catch (error) {
      logger.error('Failed to create span in Langfuse', error);
      return null;
    }
  }

  /**
   * Create or update a text prompt in Langfuse.
   *
   * If a prompt with the same name already exists, a new version is created.
   * Returns the created prompt metadata (name, version, labels).
   */
  async createPrompt(options: {
    name: string;
    prompt: string;
    labels?: string[];
    tags?: string[];
    commitMessage?: string;
    config?: Record<string, any>;
  }): Promise<{ name: string; version: number; labels: string[] } | null> {
    if (!this.isAvailable()) {
      logger.debug('Langfuse unavailable, skipping prompt creation');
      return null;
    }

    try {
      const result = await this.client!.api.promptsCreate({
        type: 'text',
        name: options.name,
        prompt: options.prompt,
        labels: options.labels ?? [],
        tags: options.tags ?? [],
        commitMessage: options.commitMessage,
        config: options.config,
      });
      logger.info(`Created prompt in Langfuse: ${options.name} (v${result.version})`);
      return { name: result.name, version: result.version, labels: result.labels };
    } catch (error) {
      logger.error(`Failed to create prompt in Langfuse: ${options.name}`, error);
      return null;
    }
  }

  /**
   * Create a score for a trace
   */
  createScore(options: CreateScoreOptions) {
    if (!this.isAvailable()) {
      logger.debug('Langfuse unavailable, skipping score creation');
      return;
    }

    try {
      this.client!.score({
        traceId: options.traceId,
        name: options.name,
        value: options.value,
        comment: options.comment,
      });
      logger.debug('Created score in Langfuse', {
        traceId: options.traceId,
        name: options.name,
      });
    } catch (error) {
      logger.error('Failed to create score in Langfuse', error);
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
