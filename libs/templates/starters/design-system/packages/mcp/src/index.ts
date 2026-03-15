#!/usr/bin/env node
/**
 * @@PROJECT_NAME MCP Server
 *
 * Exposes design system tools to AI agents via the Model Context Protocol.
 * Run with: node dist/index.js
 */

/** Minimal MCP server entry point. Wire up your MCP tools here. */
export function createMcpServer(): { start: () => Promise<void> } {
  return {
    async start() {
      // TODO: Initialize MCP server with design system tools
      // See https://modelcontextprotocol.io for documentation
      console.log('@@PROJECT_NAME MCP server starting...');
    },
  };
}

// Auto-start when run directly
const isMain = process.argv[1]?.endsWith('index.js');
if (isMain) {
  const server = createMcpServer();
  server.start().catch(console.error);
}
