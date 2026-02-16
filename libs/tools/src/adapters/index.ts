/**
 * Adapters for different surfaces (MCP, Express, LangGraph)
 */

export { McpFeatureAdapter } from './mcp-adapter.js';
export type { McpToolDefinition, McpToolHandler } from './mcp-adapter.js';

export { ExpressFeatureAdapter } from './express-adapter.js';
export type { ExpressHandler } from './express-adapter.js';

export { LangGraphFeatureAdapter } from './langgraph-adapter.js';
export type { LangGraphToolDefinition } from './langgraph-adapter.js';
