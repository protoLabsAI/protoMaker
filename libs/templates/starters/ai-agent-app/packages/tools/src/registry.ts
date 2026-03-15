import type { SharedTool, ToolContext, ToolResult } from './types.js';

/**
 * Central registry for managing shared tools.
 *
 * Provides registration, lookup, category filtering, and execution with a
 * built-in error boundary — execute() always resolves, never throws, giving
 * callers (LLM agents, HTTP handlers) structured error context.
 *
 * @example
 * ```typescript
 * import { ToolRegistry } from './registry.js';
 * import { getWeatherTool, searchWebTool } from './examples/index.js';
 *
 * const registry = new ToolRegistry();
 * registry.registerMany([getWeatherTool, searchWebTool]);
 *
 * const result = await registry.execute('get_weather', { location: 'Paris' }, context);
 * ```
 */
export class ToolRegistry {
  private tools: Map<string, SharedTool<unknown, unknown>> = new Map();

  /**
   * Register a tool. Throws if a tool with the same name is already registered.
   */
  register<TInput, TOutput>(tool: SharedTool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool as SharedTool<unknown, unknown>);
  }

  /**
   * Register multiple tools at once.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerMany(tools: SharedTool<any, any>[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name. Returns undefined if not found.
   */
  get<TInput = unknown, TOutput = unknown>(name: string): SharedTool<TInput, TOutput> | undefined {
    return this.tools.get(name) as SharedTool<TInput, TOutput> | undefined;
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool. Returns true if it was found and removed.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tool names.
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all registered tools.
   */
  listTools(): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools filtered by category metadata.
   */
  getByCategory(category: string): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.metadata?.category === category);
  }

  /**
   * Get tools filtered by tag metadata.
   */
  getByTag(tag: string): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.metadata?.tags?.includes(tag));
  }

  /**
   * Execute a tool by name with the provided input and context.
   *
   * Includes an error boundary: if the tool throws unexpectedly, the error
   * is caught and returned as a structured ToolResult. This ensures callers
   * always receive a result object, never an unhandled rejection.
   *
   * @param name - The name of the tool to execute
   * @param input - The input data for the tool (validated inside the tool)
   * @param context - Dependency injection context for the tool
   * @returns Always resolves with a ToolResult — never throws
   */
  async execute<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput,
    context: ToolContext = {}
  ): Promise<ToolResult<TOutput>> {
    const tool = this.get<TInput, TOutput>(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found in registry`,
        metadata: {
          toolName: name,
          availableTools: this.listNames(),
          recoveryHint: `Check the tool name is correct. Available tools: ${this.listNames().join(', ')}`,
        },
      };
    }

    try {
      const result = await tool.execute(input, context);

      if (!result.success) {
        const errorMessage = result.error ?? 'Tool returned a failure result';
        console.error(`[ToolRegistry] Tool '${name}' returned failure:`, { errorMessage });

        return {
          ...result,
          error: `Tool '${name}' failed: ${errorMessage}`,
          metadata: {
            ...result.metadata,
            toolName: name,
            errorMessage,
            recoveryHint:
              (result.metadata?.['recoveryHint'] as string | undefined) ??
              `The tool '${name}' encountered an error. Check the inputs and try again.`,
          },
        };
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error(`[ToolRegistry] Tool '${name}' threw an unexpected error:`, {
        toolName: name,
        errorMessage,
        stack: errorStack,
      });

      return {
        success: false,
        error: `Tool '${name}' failed: ${errorMessage}`,
        metadata: {
          toolName: name,
          originalError: error,
          errorMessage,
          recoveryHint: `The tool '${name}' encountered an unexpected error. Check the inputs and try again.`,
        },
      };
    }
  }

  /**
   * Clear all registered tools. Useful for testing.
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
