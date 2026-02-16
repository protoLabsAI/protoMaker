import type { z } from 'zod';
import type { SharedTool, ToolDefinition, ToolContext, ToolResult } from './types.js';

/**
 * Factory function to create type-safe tool definitions with Zod schemas.
 *
 * @template TInput - The input type (inferred from inputSchema)
 * @template TOutput - The output type (inferred from outputSchema)
 * @param definition - The tool definition with name, schemas, and execute function
 * @returns A SharedTool instance with validated type safety
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool } from '@automaker/tools';
 *
 * const myTool = defineSharedTool({
 *   name: 'example-tool',
 *   description: 'An example tool',
 *   inputSchema: z.object({
 *     message: z.string(),
 *   }),
 *   outputSchema: z.object({
 *     result: z.string(),
 *   }),
 *   execute: async (input, context) => {
 *     return {
 *       success: true,
 *       data: { result: `Processed: ${input.message}` },
 *     };
 *   },
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

        // Validate output if provided
        if (result.success && result.data !== undefined) {
          const validatedOutput = definition.outputSchema.parse(result.data);
          return {
            ...result,
            data: validatedOutput,
          };
        }

        return result;
      } catch (error) {
        // Handle validation or execution errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          success: false,
          error: errorMessage,
          metadata: {
            originalError: error,
          },
        };
      }
    },
    metadata: definition.metadata,
  };
}
