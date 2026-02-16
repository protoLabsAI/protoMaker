/**
 * @automaker/tools
 *
 * Unified tool definition and registry system for AutoMaker.
 * Provides type-safe tool creation with Zod schemas and centralized tool management.
 */

export { defineSharedTool } from './define-tool.js';
export { ToolRegistry } from './registry.js';
export type { ToolContext, ToolResult, SharedTool, ToolDefinition } from './types.js';
