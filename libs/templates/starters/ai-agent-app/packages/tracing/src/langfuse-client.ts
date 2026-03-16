/**
 * LangfuseClient — thin wrapper around the Langfuse SDK.
 *
 * `langfuse` is an **optional** peer dependency.  When the package is not
 * installed, or when credentials are missing, the client silently disables
 * itself and `isAvailable()` returns `false`.  Pair it with `FileTracer` as
 * the fallback (see `createTracingConfig` in `index.ts`).
 *
 * ## Quick start
 * ```ts
 * const client = new LangfuseClient({
 *   publicKey: process.env.LANGFUSE_PUBLIC_KEY,
 *   secretKey: process.env.LANGFUSE_SECRET_KEY,
 * });
 * await client.ready(); // wait for dynamic import to settle
 * ```
 */

import { randomUUID } from 'node:crypto';
import type {
  LangfuseConfig,
  CreateTraceOptions,
  CreateGenerationOptions,
  CreateSpanOptions,
  CreateScoreOptions,
  TracingClientInterface,
  Logger,
} from './types.js';

export class LangfuseClient implements TracingClientInterface {
  // The Langfuse SDK instance — typed as `any` to avoid a hard compile-time
  // dependency on the `langfuse` package (it's an optional peer dep).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _client: any = null;
  private _enabled: boolean;
  private readonly _logger: Logger;
  private readonly _initPromise: Promise<void>;

  constructor(config: LangfuseConfig = {}, logger: Logger = console) {
    this._logger = logger;
    const hasCredentials = !!(config.publicKey && config.secretKey);
    this._enabled = (config.enabled ?? true) && hasCredentials;

    if (this._enabled) {
      this._initPromise = this._init(config);
    } else {
      this._initPromise = Promise.resolve();
      this._logger.info?.('[LangfuseClient] disabled or missing credentials');
    }
  }

  private async _init(config: LangfuseConfig): Promise<void> {
    try {
      // Dynamic import so the module resolves gracefully even when langfuse
      // is not installed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('langfuse');
      this._client = new mod.Langfuse({
        publicKey: config.publicKey!,
        secretKey: config.secretKey!,
        baseUrl: config.baseUrl,
        flushAt: config.flushAt ?? 1,
        flushInterval: config.flushInterval ?? 1000,
      });
      this._logger.info?.('[LangfuseClient] initialized successfully');
    } catch (error) {
      this._logger.error?.(
        '[LangfuseClient] Failed to initialize. Is `langfuse` installed?',
        error
      );
      this._enabled = false;
    }
  }

  /**
   * Wait for the async initialization to finish.
   *
   * Call `await client.ready()` before the first use when you need Langfuse
   * to be available immediately (e.g. during server startup).
   */
  async ready(): Promise<this> {
    await this._initPromise;
    return this;
  }

  isAvailable(): boolean {
    return this._enabled && this._client !== null;
  }

  createTrace(options: CreateTraceOptions): unknown {
    if (!this.isAvailable()) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trace = (this._client as any).trace({
        id: options.id ?? randomUUID(),
        name: options.name,
        userId: options.userId,
        sessionId: options.sessionId,
        metadata: options.metadata,
        tags: options.tags,
        input: options.input,
        output: options.output,
      });
      this._logger.debug?.('[LangfuseClient] created trace', { traceId: options.id });
      return trace;
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to create trace', error);
      return null;
    }
  }

  updateTrace(
    traceId: string,
    data: { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }
  ): void {
    if (!this.isAvailable()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._client as any).trace({ id: traceId }).update(data);
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to update trace', error);
    }
  }

  createGeneration(options: CreateGenerationOptions): unknown {
    if (!this.isAvailable()) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trace = (this._client as any).trace({ id: options.traceId });
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
      this._logger.debug?.('[LangfuseClient] created generation', {
        traceId: options.traceId,
        generationId: options.id,
      });
      return generation;
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to create generation', error);
      return null;
    }
  }

  createSpan(options: CreateSpanOptions): unknown {
    if (!this.isAvailable()) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trace = (this._client as any).trace({ id: options.traceId });
      const span = trace.span({
        id: options.id,
        name: options.name,
        input: options.input,
        output: options.output,
        metadata: options.metadata,
        startTime: options.startTime,
        endTime: options.endTime,
      });
      return span;
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to create span', error);
      return null;
    }
  }

  createScore(options: CreateScoreOptions): void {
    if (!this.isAvailable()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._client as any).score({
        traceId: options.traceId,
        name: options.name,
        value: options.value,
        comment: options.comment,
      });
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to create score', error);
    }
  }

  /**
   * Create or upsert a dataset item in Langfuse.
   * Note: not part of `TracingClientInterface` — Langfuse-specific feature.
   */
  async createDatasetItem(options: {
    datasetName: string;
    input?: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    sourceTraceId?: string;
  }): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this._client as any).createDatasetItem({
        datasetName: options.datasetName,
        input: options.input,
        expectedOutput: options.expectedOutput,
        metadata: options.metadata,
        sourceTraceId: options.sourceTraceId,
      });
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to create dataset item', error);
      throw error;
    }
  }

  async flush(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this._client as any).flushAsync();
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to flush', error);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this._client as any).shutdownAsync();
      this._logger.info?.('[LangfuseClient] shutdown successfully');
    } catch (error) {
      this._logger.error?.('[LangfuseClient] failed to shutdown', error);
    }
  }
}
