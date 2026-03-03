/**
 * @protolabs-ai/tools
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
export * from './domains/twitch/index.js';
export * from './domains/hitl/index.js';

// DynamicStructuredTool factory families
export { createBoardTools } from './board-tools.js';
export type { BoardDeps } from './board-tools.js';
export { createLinearTools } from './linear-tools.js';
export type { LinearDeps, LinearIssue } from './linear-tools.js';
export { createDiscordTools } from './discord-tools.js';
export type { DiscordDeps, DiscordMessage } from './discord-tools.js';
export { createGitHubTools } from './github-tools.js';
export type { GitHubDeps, PullRequest } from './github-tools.js';
export { createClaudeCodeTool } from './claude-code-tool.js';
export type { ClaudeCodeDeps } from './claude-code-tool.js';
export { createProjectTools } from './project-tools.js';
export type { ProjectDeps } from './project-tools.js';
