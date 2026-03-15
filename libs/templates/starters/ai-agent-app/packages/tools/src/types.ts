/**
 * Core tool types for the unified tool package.
 *
 * Designed to be framework-agnostic — no imports from @protolabsai or any
 * application-specific package. Use these types as the shared contract
 * between tool definitions, the registry, and adapter layers.
 */

import type { z } from 'zod';

/**
 * Tool execution context — dependency injection container.
 *
 * Intentionally generic (Record<string, unknown>) so that tool definitions
 * remain framework-agnostic and reusable across MCP, LangGraph, and Express
 * runtimes without coupling to application-specific types.
 *
 * @example
 * ```typescript
 * // Application layer provides the concrete shape:
 * const context: ToolContext = {
 *   userId: 'user-123',
 *   tenantId: 'acme-corp',
 *   db: myDatabaseClient,
 * };
 * ```
 */
export type ToolContext = Record<string, unknown>;

/**
 * Tool execution result with optional data and error information.
 *
 * Always resolves — never throws. Callers check `success` to determine
 * whether to use `data` or handle the `error`.
 */
export interface ToolResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Shared tool definition with type-safe input/output schemas.
 *
 * Created by `defineSharedTool` and consumed by adapters (MCP, LangGraph,
 * Express) and the ToolRegistry.
 */
export interface SharedTool<TInput = unknown, TOutput = unknown> {
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

/**
 * Input shape for the `defineSharedTool` factory.
 * Identical to SharedTool — separated for readability at call sites.
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
