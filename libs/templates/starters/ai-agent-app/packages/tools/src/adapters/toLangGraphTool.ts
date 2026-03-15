import type { z } from 'zod';
import type { SharedTool, ToolContext, ToolResult } from '../core/types.js';

/**
 * LangChain DynamicStructuredTool interface (subset used by this adapter).
 * Avoids a hard compile-time dependency on @langchain/core.
 */
export interface DynamicStructuredTool {
  name: string;
  description: string;
  schema: z.ZodType<unknown>;
  func: (input: unknown) => Promise<unknown>;
}

/**
 * Convert a single `SharedTool` to a LangChain `DynamicStructuredTool`.
 *
 * The adapter:
 * - Passes the Zod schema directly to LangChain for parameter validation
 * - Wraps the execute function to inject `context` at runtime
 * - Converts `ToolResult` failures to thrown errors (LangChain convention)
 *
 * **Note:** Requires `@langchain/core` to be installed at runtime.
 *
 * @example
 * ```typescript
 * import { defineSharedTool, toLangGraphTool } from '@ai-agent-app/tools';
 * import { z } from 'zod';
 *
 * const myTool = defineSharedTool({ ... });
 *
 * const context = { config: { apiKey: process.env.API_KEY } };
 * const langchainTool = toLangGraphTool(myTool, context);
 *
 * // Use with a LangGraph agent
 * const agent = createReactAgent({ llm, tools: [langchainTool] });
 * ```
 */
export function toLangGraphTool<TInput = unknown, TOutput = unknown>(
  tool: SharedTool<TInput, TOutput>,
  context: ToolContext = {}
): DynamicStructuredTool {
  // Dynamic require to avoid hard compile-time dependency on @langchain/core
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DynamicStructuredTool: DynamicStructuredToolClass } =
    require('@langchain/core/tools') as {
      DynamicStructuredTool: new (config: {
        name: string;
        description: string;
        schema: z.ZodType<unknown>;
        func: (input: z.infer<typeof tool.inputSchema>) => Promise<unknown>;
      }) => DynamicStructuredTool;
    };

  return new DynamicStructuredToolClass({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
    func: async (input: z.infer<typeof tool.inputSchema>) => {
      const result: ToolResult<TOutput> = await tool.execute(input as TInput, context);

      // LangChain expects a thrown error on failure
      if (!result.success) {
        throw new Error(result.error ?? 'Tool execution failed');
      }

      return result.data;
    },
  });
}

/**
 * Convert multiple `SharedTool` instances to LangChain `DynamicStructuredTool`s.
 *
 * @example
 * ```typescript
 * import { toLangGraphTools } from '@ai-agent-app/tools';
 *
 * const context = { config: { apiKey: process.env.API_KEY } };
 * const langchainTools = toLangGraphTools([weatherTool, searchTool], context);
 * ```
 */
export function toLangGraphTools(
  tools: SharedTool[],
  context: ToolContext = {}
): DynamicStructuredTool[] {
  return tools.map((tool) => toLangGraphTool(tool, context));
}
