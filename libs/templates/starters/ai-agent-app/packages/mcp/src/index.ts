#!/usr/bin/env node
/**
 * MCP server for @@PROJECT_NAME.
 *
 * Exposes registered tools via the Model Context Protocol over stdio.
 *
 * ## Connect to Claude Code
 * Add to ~/.claude/settings.json → mcpServers:
 *   "@@PROJECT_NAME": { "command": "node", "args": ["/path/to/packages/mcp/dist/index.js"] }
 *
 * ## Connect to Claude Desktop
 * Add to ~/Library/Application Support/Claude/claude_desktop_config.json → mcpServers
 * (same format as above).
 *
 * ## Development (no build step)
 *   "@@PROJECT_NAME": { "command": "npx", "args": ["tsx", "/path/to/packages/mcp/src/index.ts"] }
 *
 * ## Adding tools
 *   import { myTool } from '@@PROJECT_NAME-tools';
 *   registry.register(myTool);
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry, toMCPTools, getWeatherTool, searchWebTool } from '@@PROJECT_NAME-tools';

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new ToolRegistry();

// Register example tools — remove or replace with your own
registry.registerMany([getWeatherTool, searchWebTool]);

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@@PROJECT_NAME', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

const mcpTools = toMCPTools(registry.listTools());

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: mcpTools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = mcpTools.find((t) => t.name === name);

  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const result = await tool.handler(args ?? {}, {});

  if (!result.success) {
    throw new Error(result.error ?? 'Tool execution failed');
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
  };
});

// ─── Connect ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
