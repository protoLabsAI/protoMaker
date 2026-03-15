import type { z } from 'zod';
import type { SharedTool, ToolDefinition, ToolContext, ToolResult } from './types.js';

/**
 * Factory function for creating type-safe, schema-validated tool definitions.
 *
 * Wraps the provided `execute` function with:
 * - Input validation via `inputSchema.parse()` before execution
 * - Output validation via `outputSchema.parse()` after execution
 * - Error boundary that converts thrown exceptions to structured `ToolResult`
 *
 * Tools created with `defineSharedTool` never throw — they always return a
 * `ToolResult` with `success: true | false`.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool } from '@ai-agent-app/tools';
 *
 * const greet = defineSharedTool({
 *   name: 'greet',
 *   description: 'Greet a user by name',
 *   inputSchema: z.object({ name: z.string() }),
 *   outputSchema: z.object({ message: z.string() }),
 *   execute: async (input) => ({
 *     success: true,
 *     data: { message: `Hello, ${input.name}!` },
 *   }),
 * });
 * ```
 */
export function defineSharedTool<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(
  definition: ToolDefinition<z.infer<TInputSchema>, z.infer<TOutputSchema>>
): SharedTool<z.infer<TInputSchema>, z.infer<TOutputSchema>> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema as z.ZodType<z.infer<TInputSchema>>,
    outputSchema: definition.outputSchema as z.ZodType<z.infer<TOutputSchema>>,
    execute: async (
      input: z.infer<TInputSchema>,
      context: ToolContext
    ): Promise<ToolResult<z.infer<TOutputSchema>>> => {
      try {
        // Validate input against schema
        const validatedInput = definition.inputSchema.parse(input);

        // Execute the tool with validated input
        const result = await definition.execute(validatedInput, context);

        // Validate output if execution succeeded and data is present
        if (result.success && result.data !== undefined) {
          const validatedOutput = definition.outputSchema.parse(result.data);
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
