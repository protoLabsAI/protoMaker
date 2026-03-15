/**
 * Tracing types for @@PROJECT_NAME.
 *
 * These interfaces define the contracts for both Langfuse-backed and
 * file-based local tracing, so you can swap backends without changing
 * application code.
 */

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Minimal logger interface — compatible with `console` and any structured
 * logger (pino, winston, etc.).  All methods are optional so you can pass
 * a partial implementation.
 */
export interface Logger {
  info?(msg: string, ...args: unknown[]): void;
  error?(msg: string, ...args: unknown[]): void;
  debug?(msg: string, ...args: unknown[]): void;
  warn?(msg: string, ...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Langfuse client config
// ---------------------------------------------------------------------------

/**
 * Configuration for the Langfuse client.
 * Supply `publicKey` and `secretKey` (from your Langfuse project) to enable
 * remote tracing.  Leave them empty to fall back to file-based tracing.
 */
export interface LangfuseConfig {
  publicKey?: string;
  secretKey?: string;
  /** Langfuse base URL.  Defaults to the Langfuse cloud endpoint. */
  baseUrl?: string;
  /** Set to `false` to explicitly disable the client. */
  enabled?: boolean;
  /** Number of events to batch before flushing.  Defaults to 1. */
  flushAt?: number;
  /** Flush interval in milliseconds.  Defaults to 1000. */
  flushInterval?: number;
}

// ---------------------------------------------------------------------------
// Trace / generation / span / score options
// ---------------------------------------------------------------------------

export interface CreateTraceOptions {
  /** Unique trace identifier.  Generated if omitted. */
  id?: string;
  /** Human-readable name (e.g. "chat", "summarize"). */
  name?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  input?: unknown;
  output?: unknown;
}

export interface CreateGenerationOptions {
  /** Unique generation identifier. */
  id?: string;
  /** Trace this generation belongs to. */
  traceId: string;
  name?: string;
  model?: string;
  modelParameters?: {
    temperature?: number;
    maxTokens?: number;
    [key: string]: unknown;
  };
  input?: unknown;
  output?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, unknown>;
  startTime?: Date;
  endTime?: Date;
}

export interface CreateSpanOptions {
  id?: string;
  traceId: string;
  name?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  startTime?: Date;
  endTime?: Date;
}

export interface CreateScoreOptions {
  traceId: string;
  /** Score label (e.g. "quality", "success"). */
  name: string;
  /** Numeric score value. */
  value: number;
  comment?: string;
}

// ---------------------------------------------------------------------------
// Tracing client interface
// ---------------------------------------------------------------------------

/**
 * Common interface implemented by both `LangfuseClient` (remote tracing) and
 * `FileTracer` (local JSON-file tracing).  Use this type in `TracingConfig`
 * so you can swap backends without touching application code.
 */
export interface TracingClientInterface {
  isAvailable(): boolean;
  createTrace(options: CreateTraceOptions): unknown;
  updateTrace(
    traceId: string,
    data: { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }
  ): void;
  createGeneration(options: CreateGenerationOptions): unknown;
  createSpan(options: CreateSpanOptions): unknown;
  createScore(options: CreateScoreOptions): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

// ---------------------------------------------------------------------------
// File tracer records (written to .traces/*.json)
// ---------------------------------------------------------------------------

export interface SpanRecord {
  spanId?: string;
  name: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
}

/**
 * A single trace record written to `.traces/<traceId>.json`.
 */
export interface TraceRecord {
  traceId: string;
  name: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
  latencyMs?: number;
  /** ISO 8601 timestamp of when the trace was created. */
  timestamp: string;
  spans?: SpanRecord[];
  error?: string;
}
