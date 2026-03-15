/**
 * FileTracer — built-in local tracing backend.
 *
 * Writes JSON trace records to `.traces/<traceId>.json` so you can inspect
 * agent runs without configuring Langfuse.  This is the **default** backend
 * when `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are not set.
 *
 * ## Trace files
 * Each flush writes one file per pending trace:
 * ```
 * .traces/
 *   trace-<uuid>.json    ← full TraceRecord as pretty-printed JSON
 * ```
 *
 * ## Usage
 * ```ts
 * const tracer = new FileTracer({ dir: '.traces' });
 * const config: TracingConfig = { enabled: true, client: tracer };
 * ```
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  TracingClientInterface,
  CreateTraceOptions,
  CreateGenerationOptions,
  CreateSpanOptions,
  CreateScoreOptions,
  TraceRecord,
  SpanRecord,
  Logger,
} from './types.js';

export interface FileTracerConfig {
  /**
   * Directory to write trace files.
   * Defaults to `.traces` relative to `process.cwd()`.
   */
  dir?: string;
  /** Logger for internal messages.  Defaults to `console`. */
  logger?: Logger;
}

export class FileTracer implements TracingClientInterface {
  private readonly dir: string;
  private readonly logger: Logger;
  /** In-memory accumulator: traceId → TraceRecord */
  private readonly pending = new Map<string, TraceRecord>();

  constructor(config: FileTracerConfig = {}) {
    this.dir = config.dir ?? join(process.cwd(), '.traces');
    this.logger = config.logger ?? console;
  }

  /** Always returns `true` — file tracing is always available. */
  isAvailable(): boolean {
    return true;
  }

  createTrace(options: CreateTraceOptions): TraceRecord {
    const traceId = options.id ?? randomUUID();
    const record: TraceRecord = {
      traceId,
      name: options.name ?? 'trace',
      userId: options.userId,
      sessionId: options.sessionId,
      tags: options.tags,
      metadata: options.metadata,
      input: options.input,
      output: options.output,
      timestamp: new Date().toISOString(),
      spans: [],
    };
    this.pending.set(traceId, record);
    return record;
  }

  updateTrace(
    traceId: string,
    data: { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }
  ): void {
    const record = this.pending.get(traceId);
    if (!record) return;
    if (data.input !== undefined) record.input = data.input;
    if (data.output !== undefined) record.output = data.output;
    if (data.metadata) {
      record.metadata = { ...(record.metadata ?? {}), ...data.metadata };
    }
  }

  createGeneration(options: CreateGenerationOptions): void {
    const record = this.pending.get(options.traceId);
    if (!record) return;

    if (options.model) record.model = options.model;

    if (
      options.usage?.promptTokens !== undefined &&
      options.usage?.completionTokens !== undefined
    ) {
      const pt = options.usage.promptTokens ?? 0;
      const ct = options.usage.completionTokens ?? 0;
      record.usage = {
        promptTokens: pt,
        completionTokens: ct,
        totalTokens: options.usage.totalTokens ?? pt + ct,
      };
    }

    const meta = options.metadata ?? {};
    if (typeof meta['latencyMs'] === 'number') {
      record.latencyMs = meta['latencyMs'];
    }
    if (typeof meta['cost'] === 'number') {
      record.costUsd = meta['cost'];
    }
    if (typeof meta['error'] === 'string') {
      record.error = meta['error'];
    }
  }

  createSpan(options: CreateSpanOptions): void {
    const record = this.pending.get(options.traceId);
    if (!record) return;

    const span: SpanRecord = {
      spanId: options.id,
      name: options.name ?? 'span',
      input: options.input,
      output: options.output,
      metadata: options.metadata,
      startTime: options.startTime?.toISOString(),
      endTime: options.endTime?.toISOString(),
    };

    record.spans = record.spans ?? [];
    record.spans.push(span);
  }

  /** Scores are a Langfuse-specific concept — no-op for file tracing. */
  createScore(_options: CreateScoreOptions): void {
    // no-op
  }

  /**
   * Write all pending traces to disk and clear the in-memory buffer.
   *
   * Creates the target directory if it does not exist.
   */
  async flush(): Promise<void> {
    if (this.pending.size === 0) return;

    try {
      await mkdir(this.dir, { recursive: true });
    } catch (err) {
      this.logger.error?.(`[FileTracer] Failed to create traces directory: ${this.dir}`, err);
      return;
    }

    const records = Array.from(this.pending.values());
    this.pending.clear();

    for (const record of records) {
      const filename = `trace-${record.traceId}.json`;
      const filepath = join(this.dir, filename);
      try {
        await writeFile(filepath, JSON.stringify(record, null, 2), 'utf-8');
        this.logger.debug?.(`[FileTracer] wrote ${filepath}`);
      } catch (err) {
        this.logger.error?.(`[FileTracer] Failed to write ${filepath}`, err);
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.flush();
  }

  /** Return the directory where traces are written. */
  getDir(): string {
    return this.dir;
  }
}
