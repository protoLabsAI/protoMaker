import { z } from 'zod';

/**
 * Configuration for Langfuse client
 */
export interface LangfuseConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  flushAt?: number;
  flushInterval?: number;
}

/**
 * Prompt configuration schema for Langfuse prompts
 */
export const PromptConfigSchema = z.object({
  name: z.string().describe('The name of the prompt in Langfuse'),
  version: z.number().optional().describe('Specific version of the prompt (optional)'),
  variables: z
    .record(z.string(), z.any())
    .optional()
    .describe('Variables to inject into the prompt'),
  fallbackPrompt: z
    .string()
    .optional()
    .describe('Fallback prompt text when Langfuse is unavailable'),
});

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

/**
 * Options for executing a tracked prompt
 */
export interface ExecutePromptOptions {
  /** Prompt configuration */
  prompt: PromptConfig;
  /** Model to use for generation */
  model: string;
  /** Temperature setting (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Additional metadata to attach to the trace */
  metadata?: Record<string, any>;
  /** Tags for filtering and organization */
  tags?: string[];
  /** User identifier */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
}

/**
 * Result from executing a tracked prompt
 */
export interface ExecutePromptResult {
  /** Generated completion text */
  completion: string;
  /** Trace ID from Langfuse (if available) */
  traceId?: string;
  /** Generation ID from Langfuse (if available) */
  generationId?: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Latency in milliseconds */
  latency: number;
  /** Whether fallback mode was used */
  isFallback: boolean;
}

/**
 * Options for creating a trace
 */
export interface CreateTraceOptions {
  /** Unique trace identifier */
  id?: string;
  /** Name/description of the trace */
  name?: string;
  /** User identifier */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Tags for filtering */
  tags?: string[];
  /** Trace input (prompt, messages, etc.) */
  input?: any;
  /** Trace output (response, completion, etc.) */
  output?: any;
}

/**
 * Options for creating a generation span
 */
export interface CreateGenerationOptions {
  /** Unique generation identifier */
  id?: string;
  /** Trace ID to attach this generation to */
  traceId: string;
  /** Name/description of the generation */
  name?: string;
  /** Model identifier */
  model?: string;
  /** Model parameters */
  modelParameters?: {
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
  };
  /** Input prompt */
  input?: any;
  /** Generated output */
  output?: any;
  /** Token usage */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Start time */
  startTime?: Date;
  /** End time */
  endTime?: Date;
}

/**
 * Options for creating a span
 */
export interface CreateSpanOptions {
  /** Unique span identifier */
  id?: string;
  /** Trace ID to attach this span to */
  traceId: string;
  /** Name/description of the span */
  name?: string;
  /** Input data */
  input?: any;
  /** Output data */
  output?: any;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Start time */
  startTime?: Date;
  /** End time */
  endTime?: Date;
}

/**
 * Options for creating a score
 */
export interface CreateScoreOptions {
  /** Trace ID to attach this score to */
  traceId: string;
  /** Score name (e.g., 'success', 'quality') */
  name: string;
  /** Numeric score value */
  value: number;
  /** Optional comment */
  comment?: string;
}
