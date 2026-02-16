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
   * @param name - The name of the tool to execute
   * @param input - The input data for the tool
   * @param context - The execution context for dependency injection
   * @returns The tool execution result
   * @throws Error if the tool is not found
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
      };
    }

    try {
      return await tool.execute(input, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        success: false,
        error: `Failed to execute tool '${name}': ${errorMessage}`,
        metadata: {
          originalError: error,
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
