import type { SharedTool, ToolContext, ToolResult } from './types.js';
import type { z } from 'zod';

/**
 * Factory function to create type-safe tool definitions with Zod schemas.
 *
 * The returned SharedTool:
 * - Validates input against `inputSchema` before execution
 * - Validates output against `outputSchema` on success
 * - Wraps all errors (validation or execution) into a structured ToolResult
 *   so callers never have to catch exceptions
 *
 * TypeScript infers `TInput` and `TOutput` directly from the provided Zod
 * schemas, so the `execute` callback is fully typed without manual annotations.
 *
 * @param definition - Tool definition with name, schemas, and execute function
 * @returns A SharedTool with validated type safety and error boundaries
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool } from './define-tool.js';
 *
 * const echoTool = defineSharedTool({
 *   name: 'echo',
 *   description: 'Returns the input message unchanged',
 *   inputSchema: z.object({
 *     message: z.string().describe('The message to echo'),
 *   }),
 *   outputSchema: z.object({
 *     result: z.string(),
 *   }),
 *   execute: async (input, _context) => ({
 *     success: true,
 *     data: { result: input.message },
 *   }),
 * });
 * ```
 */
export function defineSharedTool<TInput, TOutput>(definition: {
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
}): SharedTool<TInput, TOutput> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    execute: async (input: TInput, context: ToolContext): Promise<ToolResult<TOutput>> => {
      try {
        // Validate input against schema before execution
        const validatedInput = definition.inputSchema.parse(input) as TInput;

        // Execute the tool with validated input
        const result = await definition.execute(validatedInput, context);

        // Validate output on success
        if (result.success && result.data !== undefined) {
          const validatedOutput = definition.outputSchema.parse(result.data) as TOutput;
          return { ...result, data: validatedOutput };
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          success: false,
          error: errorMessage,
          metadata: { originalError: error },
        };
      }
    },
    metadata: definition.metadata,
  };
}
