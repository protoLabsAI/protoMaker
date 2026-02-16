import type { z } from 'zod';

/**
 * Context interface for dependency injection into tools.
 * Provides access to services, configuration, and execution context.
 */
export interface ToolContext {
  /**
   * Services available to the tool (e.g., database, API clients, etc.)
   */
  services?: Record<string, unknown>;

  /**
   * Configuration values specific to the tool execution
   */
  config?: Record<string, unknown>;

  /**
   * Feature ID or context identifier for the current execution
   */
  featureId?: string;

  /**
   * Project path for file system operations
   */
  projectPath?: string;

  /**
   * Additional metadata that can be passed to tools
   */
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution result with optional metadata and errors
 */
export interface ToolResult<TOutput> {
  /**
   * Indicates if the tool execution was successful
   */
  success: boolean;

  /**
   * The output data from the tool execution
   */
  data?: TOutput;

  /**
   * Error message if the execution failed
   */
  error?: string;

  /**
   * Additional metadata about the execution
   */
  metadata?: Record<string, unknown>;
}

/**
 * Shared tool definition with type-safe input/output schemas
 */
export interface SharedTool<TInput = unknown, TOutput = unknown> {
  /**
   * Unique identifier for the tool
   */
  name: string;

  /**
   * Human-readable description of what the tool does
   */
  description: string;

  /**
   * Zod schema for validating tool inputs
   */
  inputSchema: z.ZodType<TInput>;

  /**
   * Zod schema for validating tool outputs
   */
  outputSchema: z.ZodType<TOutput>;

  /**
   * The tool execution function
   */
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;

  /**
   * Optional metadata for categorizing or tagging tools
   */
  metadata?: {
    category?: string;
    tags?: string[];
    version?: string;
  };
}

/**
 * Tool definition input for the defineSharedTool factory
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
