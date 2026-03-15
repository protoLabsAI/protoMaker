/**
 * @@@PROJECT_NAME-tools — Define-once, deploy-everywhere tool package
 *
 * A single SharedTool definition works across three runtimes:
 * - MCP (Model Context Protocol) via `toMCPTool` / `toMCPTools`
 * - LangGraph agents via `toLangGraphTool` / `toLangGraphTools`
 * - Express HTTP routes via `toExpressRouter`
 *
 * Quick start:
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool, ToolRegistry } from '@@PROJECT_NAME-tools';
 *
 * const myTool = defineSharedTool({
 *   name: 'my_tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({ value: z.string() }),
 *   outputSchema: z.object({ result: z.string() }),
 *   execute: async (input) => ({ success: true, data: { result: input.value.toUpperCase() } }),
 * });
 *
 * const registry = new ToolRegistry();
 * registry.register(myTool);
 * ```
 */

// Core
export { defineSharedTool } from './define-tool.js';
export { ToolRegistry } from './registry.js';

// Types
export type { ToolContext, ToolResult, SharedTool, ToolDefinition } from './types.js';

// Adapters
export { toMCPTool, toMCPTools } from './adapters/mcp-adapter.js';
export type { MCPToolEntry } from './adapters/mcp-adapter.js';

export { toLangGraphTool, toLangGraphTools } from './adapters/langgraph-adapter.js';

export { toExpressRouter } from './adapters/express-adapter.js';
export type { ExpressAdapterOptions } from './adapters/express-adapter.js';

// Examples
export { getWeatherTool, searchWebTool } from './examples/index.js';
