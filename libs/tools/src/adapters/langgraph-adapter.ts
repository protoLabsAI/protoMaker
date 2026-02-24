import type { z } from 'zod';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { SharedTool, ToolContext, ToolResult } from '../types.js';

/**
 * Converts a SharedTool to a LangChain DynamicStructuredTool
 *
 * The adapter:
 * - Passes the Zod schema directly to LangChain for validation
 * - Wraps the tool handler to inject context at runtime
 * - Converts ToolResult format to LangChain's expected output
 *
 * @param tool - The SharedTool to convert
 * @param context - The ToolContext to inject into tool execution
 * @returns A LangChain-compatible DynamicStructuredTool
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool, toLangGraphTool } from '@protolabs-ai/tools';
 * import { DynamicStructuredTool } from '@langchain/core/tools';
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
 *
 * const context: ToolContext = {
 *   projectPath: '/path/to/project',
 *   featureId: 'feature-123',
 * };
 *
 * const langchainTool = toLangGraphTool(myTool, context);
 * // Use with LangGraph/LangChain agents
 * ```
 */
export function toLangGraphTool<TInput = unknown, TOutput = unknown>(
  tool: SharedTool<TInput, TOutput>,
  context: ToolContext = {}
): DynamicStructuredTool {
  // Import DynamicStructuredTool dynamically to avoid hard dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DynamicStructuredTool: DynamicStructuredToolClass } = require('@langchain/core/tools');

  return new DynamicStructuredToolClass({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
    func: async (input: z.infer<typeof tool.inputSchema>) => {
      // Execute the shared tool with injected context
      const result: ToolResult<TOutput> = await tool.execute(input as TInput, context);

      // Convert ToolResult to LangChain output format
      if (!result.success) {
        throw new Error(result.error || 'Tool execution failed');
      }

      return result.data;
    },
  });
}

/**
 * Converts multiple SharedTools to LangChain DynamicStructuredTools
 *
 * @param tools - Array of SharedTools to convert
 * @param context - The ToolContext to inject into all tool executions
 * @returns Array of LangChain-compatible DynamicStructuredTools
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool, toLangGraphTools } from '@protolabs-ai/tools';
 *
 * const tools = [
 *   defineSharedTool({
 *     name: 'tool-1',
 *     description: 'First tool',
 *     inputSchema: z.object({ input1: z.string() }),
 *     outputSchema: z.object({ output1: z.string() }),
 *     execute: async (input, context) => ({
 *       success: true,
 *       data: { output1: input.input1 },
 *     }),
 *   }),
 *   defineSharedTool({
 *     name: 'tool-2',
 *     description: 'Second tool',
 *     inputSchema: z.object({ input2: z.number() }),
 *     outputSchema: z.object({ output2: z.number() }),
 *     execute: async (input, context) => ({
 *       success: true,
 *       data: { output2: input.input2 * 2 },
 *     }),
 *   }),
 * ];
 *
 * const context: ToolContext = {
 *   projectPath: '/path/to/project',
 * };
 *
 * const langchainTools = toLangGraphTools(tools, context);
 * ```
 */
export function toLangGraphTools(
  tools: SharedTool[],
  context: ToolContext = {}
): DynamicStructuredTool[] {
  return tools.map((tool) => toLangGraphTool(tool, context));
}
