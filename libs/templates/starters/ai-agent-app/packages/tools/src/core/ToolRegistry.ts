import type { SharedTool, ToolContext, ToolResult } from './types.js';

/**
 * Central registry for managing and executing shared tools.
 *
 * Provides:
 * - Tool registration with duplicate detection
 * - Category-based filtering
 * - Error-boundary execution (never throws — always returns ToolResult)
 *
 * @example
 * ```typescript
 * import { ToolRegistry, defineSharedTool } from '@ai-agent-app/tools';
 * import { z } from 'zod';
 *
 * const registry = new ToolRegistry();
 *
 * registry.register(defineSharedTool({
 *   name: 'greet',
 *   description: 'Greet a user',
 *   inputSchema: z.object({ name: z.string() }),
 *   outputSchema: z.object({ message: z.string() }),
 *   execute: async (input) => ({ success: true, data: { message: `Hi ${input.name}` } }),
 * }));
 *
 * const result = await registry.execute('greet', { name: 'Alice' }, {});
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
  registerMany(tools: SharedTool<unknown, unknown>[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name. Returns `undefined` if not found.
   */
  get<TInput = unknown, TOutput = unknown>(name: string): SharedTool<TInput, TOutput> | undefined {
    return this.tools.get(name) as SharedTool<TInput, TOutput> | undefined;
  }

  /**
   * Returns `true` if a tool with the given name is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool by name. Returns `true` if the tool was found and removed.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * List all registered tool names.
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * List all registered tool instances.
   */
  listTools(): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tools that belong to the specified category.
   */
  getByCategory(category: string): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.metadata?.category === category);
  }

  /**
   * Get all tools tagged with the specified tag.
   */
  getByTag(tag: string): SharedTool<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.metadata?.tags?.includes(tag));
  }

  /**
   * Execute a tool by name with the provided input and context.
   *
   * Includes an error boundary — always resolves, never throws.
   * If the tool is not found, returns a structured error result.
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
          recoveryHint: `Verify the tool name is correct and the tool has been registered. Use listNames() to see available tools.`,
        },
      };
    }

    try {
      const result = await tool.execute(input, context);

      if (!result.success) {
        const errorMessage = result.error ?? 'Tool returned a failure result';

        console.error(`[ToolRegistry] Tool '${name}' returned a failure:`, {
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
              `Check the inputs for '${name}' and try again.`,
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
          recoveryHint: `The tool '${name}' encountered an error. Check the inputs and try again.`,
        },
      };
    }
  }

  /**
   * Remove all registered tools. Useful for testing or resetting state.
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * The number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
