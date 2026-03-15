#!/usr/bin/env node
/**
 * MCP server for @@PROJECT_NAME design system.
 *
 * Exposes design-system capabilities as MCP tools over stdio, enabling
 * AI assistants (Claude, etc.) to work directly with .pen files, tokens,
 * React components, and accessibility audits.
 *
 * ## Tool categories
 *
 *   Design     — Read/parse .pen files, list & inspect components
 *   Tokens     — Extract W3C DTCG tokens, export to CSS or Tailwind
 *   Components — Generate React TSX or static HTML from .pen frames
 *   A11y       — WCAG audits, contrast checking, accessible shade finder
 *
 * ## Connect to Claude Code
 *
 * Add to ~/.claude/settings.json → mcpServers:
 * ```json
 * {
 *   "@@PROJECT_NAME": {
 *     "command": "node",
 *     "args": ["/path/to/packages/mcp/dist/index.js"]
 *   }
 * }
 * ```
 *
 * ## Connect to Claude Desktop
 *
 * Add to ~/Library/Application Support/Claude/claude_desktop_config.json → mcpServers
 * (same format as above).
 *
 * ## Development (no build step required)
 *
 * ```json
 * {
 *   "@@PROJECT_NAME": {
 *     "command": "npx",
 *     "args": ["tsx", "/path/to/packages/mcp/src/index.ts"]
 *   }
 * }
 * ```
 *
 * ## Adding tools
 *
 * 1. Define a new tool with `defineSharedTool()` in one of the tool files
 *    (src/tools/design-tools.ts, token-tools.ts, component-tools.ts, a11y-tools.ts)
 * 2. Add it to the exported array at the bottom of that file
 * 3. The tool is automatically registered — no changes needed here
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toMCPTools } from './lib/define-tool.js';
import { designTools } from './tools/design-tools.js';
import { tokenTools } from './tools/token-tools.js';
import { componentTools } from './tools/component-tools.js';
import { a11yTools } from './tools/a11y-tools.js';

// ─── Registry ─────────────────────────────────────────────────────────────────

// Collect all tools from each category
const allTools = [...designTools, ...tokenTools, ...componentTools, ...a11yTools];

// Convert to MCP-compatible entries (Zod → JSON Schema)
const mcpTools = toMCPTools(allTools);

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@@PROJECT_NAME-design-system', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: mcpTools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

// Execute a tool by name
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = mcpTools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(
      `Tool not found: "${name}". Available tools: ${mcpTools.map((t) => t.name).join(', ')}`
    );
  }

  const result = await tool.handler(args ?? {}, {});

  if (!result.success) {
    throw new Error(result.error ?? `Tool "${name}" execution failed`);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result.data, null, 2),
      },
    ],
  };
});

// ─── Connect ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
