/**
 * @ai-agent-app/tools
 *
 * Standalone tools package — define once, deploy everywhere.
 *
 * Define a tool with Zod schemas and a typed execute function, then
 * deploy it to any runtime without changing the tool definition:
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool, ToolRegistry, toMCPTool, toLangGraphTool, toExpressRouter } from '@ai-agent-app/tools';
 *
 * const myTool = defineSharedTool({
 *   name: 'my-tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({ query: z.string() }),
 *   outputSchema: z.object({ result: z.string() }),
 *   execute: async (input) => ({ success: true, data: { result: input.query } }),
 * });
 *
 * // MCP
 * const mcpEntry = toMCPTool(myTool);
 *
 * // LangGraph
 * const langchainTool = toLangGraphTool(myTool, { config: {} });
 *
 * // Express
 * const router = toExpressRouter([myTool]);
 * ```
 */

// ─── Core ────────────────────────────────────────────────────────────────────

export { defineSharedTool } from './core/defineSharedTool.js';
export { ToolRegistry } from './core/ToolRegistry.js';
export type { ToolContext, ToolResult, SharedTool, ToolDefinition } from './core/types.js';

// ─── Adapters ─────────────────────────────────────────────────────────────────

export { toMCPTool, toMCPTools } from './adapters/toMCPTool.js';
export type { MCPToolEntry } from './adapters/toMCPTool.js';

export { toLangGraphTool, toLangGraphTools } from './adapters/toLangGraphTool.js';
export type { DynamicStructuredTool } from './adapters/toLangGraphTool.js';

export { toExpressRouter } from './adapters/toExpressRouter.js';
export type { ExpressAdapterOptions } from './adapters/toExpressRouter.js';

// ─── Examples ────────────────────────────────────────────────────────────────

export { get_weather } from './examples/get_weather.js';
export { search_web } from './examples/search_web.js';
