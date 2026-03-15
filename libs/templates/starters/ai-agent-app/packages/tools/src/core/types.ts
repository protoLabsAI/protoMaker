/**
 * Core tool types for the standalone tools package.
 *
 * These types are framework-agnostic and carry zero dependencies on any
 * specific AI platform or application framework.
 */

import type { z } from 'zod';

/**
 * Generic tool execution context — a plain key/value DI container.
 *
 * Add any domain-specific properties at usage time:
 *
 * @example
 * ```typescript
 * const context: ToolContext = {
 *   services: { db: myDatabase },
 *   config: { apiKey: process.env.API_KEY },
 *   userId: 'user-123',
 * };
 * ```
 */
export interface ToolContext {
  /** Named service instances to inject into tools */
  services?: Record<string, unknown>;
  /** Runtime configuration values */
  config?: Record<string, unknown>;
  /** Arbitrary metadata for the current execution */
  metadata?: Record<string, unknown>;
  /** Allow any additional properties */
  [key: string]: unknown;
}

/**
 * Standard tool execution result with optional data and error information.
 *
 * Tools always resolve — they never throw. On failure, `success` is `false`
 * and `error` contains a human-readable message.
 */
export interface ToolResult<TOutput = unknown> {
  /** Whether the tool executed successfully */
  success: boolean;
  /** The tool's output data (present when success is true) */
  data?: TOutput;
  /** Human-readable error message (present when success is false) */
  error?: string;
  /** Machine-readable error code for programmatic handling */
  errorCode?: string;
  /** Additional metadata about the execution */
  metadata?: Record<string, unknown>;
}

/**
 * A fully-defined, type-safe tool with Zod schemas for input and output.
 *
 * Created by `defineSharedTool` and registered in a `ToolRegistry`.
 * Can be adapted to MCP, LangGraph, or Express via the provided adapters.
 */
export interface SharedTool<TInput = unknown, TOutput = unknown> {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Zod schema used to validate and parse tool inputs */
  inputSchema: z.ZodType<TInput>;
  /** Zod schema used to validate tool outputs */
  outputSchema: z.ZodType<TOutput>;
  /** The tool's execution function — always resolves, never throws */
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  /** Optional classification metadata */
  metadata?: {
    category?: string;
    tags?: string[];
    version?: string;
  };
}

/**
 * Input shape for the `defineSharedTool` factory.
 *
 * Identical to `SharedTool` in structure — the factory adds validation
 * wrapping around the provided `execute` function.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  metadata?: {
    category?: string;
    tags?: string[];
    version?: string;
  };
}
