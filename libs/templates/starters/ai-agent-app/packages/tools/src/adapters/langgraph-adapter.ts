/**
 * LangGraph adapter for SharedTool conversion.
 *
 * Converts SharedTool definitions into LangChain DynamicStructuredTools so
 * they can be used directly in LangGraph agents and tool-calling chains.
 *
 * @langchain/core is an OPTIONAL peer dependency. The adapter uses dynamic
 * require() to avoid a hard install requirement — users who don't need LangGraph
 * can skip installing @langchain/core entirely.
 */

import type { SharedTool, ToolContext, ToolResult } from '../types.js';

/**
 * Convert a SharedTool to a LangChain DynamicStructuredTool.
 *
 * The Zod schema is passed directly to LangChain for validation, and the
 * tool's ToolResult is unwrapped into LangChain's expected return format.
 *
 * **Requires** `@langchain/core` to be installed:
 * ```
 * npm install @langchain/core
 * ```
 *
 * @param tool - The SharedTool to convert
 * @param context - ToolContext injected into every execution call
 * @returns A LangChain DynamicStructuredTool
 *
 * @example
 * ```typescript
 * import { createReactAgent } from '@langchain/langgraph/prebuilt';
 * import { ChatAnthropic } from '@langchain/anthropic';
 * import { toLangGraphTool } from './adapters/langgraph-adapter.js';
 * import { getWeatherTool } from './examples/index.js';
 *
 * const context = { apiKey: process.env.WEATHER_API_KEY };
 * const agent = createReactAgent({
 *   llm: new ChatAnthropic({ model: 'claude-opus-4-5' }),
 *   tools: [toLangGraphTool(getWeatherTool, context)],
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toLangGraphTool<TInput = unknown, TOutput = unknown>(
  tool: SharedTool<TInput, TOutput>,
  context: ToolContext = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // Dynamic require avoids a hard compile-time dependency on @langchain/core.
  // If the package is missing, this will throw at call-time with a clear error.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DynamicStructuredTool } = require('@langchain/core/tools') as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DynamicStructuredTool: new (params: {
      name: string;
      description: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      func: (input: any) => Promise<unknown>;
    }) => unknown;
  };

  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    func: async (input: any) => {
      const result: ToolResult<TOutput> = await tool.execute(input as TInput, context);

      if (!result.success) {
        throw new Error(result.error ?? 'Tool execution failed');
      }

      return result.data;
    },
  });
}

/**
 * Convert multiple SharedTools to LangChain DynamicStructuredTools.
 *
 * @param tools - Array of SharedTools to convert
 * @param context - ToolContext injected into all tool executions
 * @returns Array of LangChain DynamicStructuredTools
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toLangGraphTools(tools: SharedTool[], context: ToolContext = {}): any[] {
  return tools.map((tool) => toLangGraphTool(tool, context));
}
