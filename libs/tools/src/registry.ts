import type { SharedTool, ToolContext, ToolResult } from './types.js';

/**
 * Central registry for managing shared tools.
 * Provides registration, lookup, and execution capabilities for tools.
 */
export class ToolRegistry {
  private tools: Map<string, SharedTool<unknown, unknown>> = new Map();

  /**
   * Register a tool in the registry.
   * Throws an error if a tool with the same name is already registered.
   *
   * @param tool - The SharedTool instance to register
   * @throws Error if tool with same name already exists
   */
  register<TInput, TOutput>(tool: SharedTool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' is already registered`);
    }

    this.tools.set(tool.name, tool as SharedTool<unknown, unknown>);
  }

  /**
   * Register multiple tools at once.
   *
   * @param tools - Array of SharedTool instances to register
   */
  registerMany(tools: SharedTool<unknown, unknown>[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by its name.
   *
   * @param name - The name of the tool to retrieve
   * @returns The SharedTool instance or undefined if not found
   */
  get<TInput = unknown, TOutput = unknown>(name: string): SharedTool<TInput, TOutput> | undefined {
    return this.tools.get(name) as SharedTool<TInput, TOutput> | undefined;
  }

  /**
   * Check if a tool is registered.
   *
   * @param name - The name of the tool to check
   * @returns True if the tool exists in the registry
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool from the registry.
   *
   * @param name - The name of the tool to unregister
   * @returns True if the tool was found and removed
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tool names.
   *
   * @returns Array of tool names
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all registered tools.
   *
   * @returns Array of SharedTool instances
   */
  listTools(): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools filtered by category.
   *
   * @param category - The category to filter by
   * @returns Array of SharedTool instances in the specified category
   */
  getByCategory(category: string): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.metadata?.category === category);
  }

  /**
   * Get tools filtered by tag.
   *
   * @param tag - The tag to filter by
   * @returns Array of SharedTool instances with the specified tag
   */
  getByTag(tag: string): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.metadata?.tags?.includes(tag));
  }

  /**
   * Execute a tool by name with the provided input and context.
   *
   * Includes an error boundary that catches tool execution errors and converts
   * them to structured error responses instead of propagating exceptions. This
   * ensures the LLM receives error context rather than causing a session crash.
   *
   * The structured error response includes:
   * - toolName: the name of the tool that failed
   * - errorMessage: the original error message for debugging
   * - recoveryHint: a suggested action to recover from the error
   *
   * @param name - The name of the tool to execute
   * @param input - The input data for the tool
   * @param context - The execution context for dependency injection
   * @returns The tool execution result, always resolves (never throws)
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
          recoveryHint: `Verify the tool name is correct and the tool has been registered. Available tools can be listed via the registry.`,
        },
      };
    }

    try {
      const result = await tool.execute(input, context);

      // If the tool returned a failure result (e.g. caught internally by defineSharedTool),
      // enrich it with structured error metadata so the LLM gets full context.
      if (!result.success) {
        const errorMessage = result.error ?? 'Tool returned a failure result';

        // Log for server-side debugging
        console.error(`[ToolRegistry] Tool '${name}' returned a failure result:`, {
          toolName: name,
          errorMessage,
        });

        return {
          ...result,
          error: `Tool '${name}' failed: ${errorMessage}`,
          metadata: {
            ...result.metadata,
            toolName: name,
            errorMessage,
            recoveryHint:
              (result.metadata?.recoveryHint as string | undefined) ??
              `The tool '${name}' encountered an error. Check the inputs and try again. If the problem persists, the tool may need reconfiguration.`,
          },
        };
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log original error for debugging — preserve full details server-side
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
          recoveryHint: `The tool '${name}' encountered an error. Check the inputs and try again. If the problem persists, the tool may need reconfiguration.`,
        },
      };
    }
  }

  /**
   * Clear all registered tools from the registry.
   * Useful for testing or resetting the registry state.
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get the count of registered tools.
   *
   * @returns The number of tools in the registry
   */
  get size(): number {
    return this.tools.size;
  }
}
