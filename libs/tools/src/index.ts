/**
 * @automaker/tools
 *
 * Unified tool definition and registry system for AutoMaker.
 * Provides type-safe tool creation with Zod schemas and centralized tool management.
 */

export { defineSharedTool } from './define-tool.js';
export { ToolRegistry } from './registry.js';
export { toLangGraphTool, toLangGraphTools } from './adapters/langgraph-adapter.js';
export type { ToolContext, ToolResult, SharedTool, ToolDefinition } from './types.js';
export { toMCPTool, toMCPTools, type MCPToolEntry } from './adapters/index.js';
export { toExpressRouter, type ExpressAdapterOptions } from './adapters/index.js';

// Domain-specific tools
export * from './domains/features/index.js';
export * from './domains/ideas/index.js';
export * from './domains/twitch/index.js';
