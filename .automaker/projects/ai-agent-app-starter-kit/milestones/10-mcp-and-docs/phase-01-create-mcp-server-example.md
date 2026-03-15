# Phase 1: Create MCP server example

_AI Agent App Starter Kit > MCP Server + Documentation_

Create packages/mcp/ in the starter kit with a minimal MCP server (~50-80 lines) that: imports Server and StdioServerTransport from @modelcontextprotocol/sdk, loads tools from the tools package registry, converts them using toMCPTool adapter, registers ListToolsRequestSchema and CallToolRequestSchema handlers. Include the example tools (get_weather, search_web) auto-registered. Add a bin entry so users can run it as a CLI. Document how to connect it to Claude Code or other MCP clients.

**Complexity:** medium

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/mcp/src/index.ts
- libs/templates/starters/ai-agent-app/packages/mcp/package.json

## Acceptance Criteria

- [ ] MCP server starts via CLI
- [ ] Lists tools from registry
- [ ] Executes tools via MCP protocol
- [ ] Works with Claude Code as client
- [ ] Under 80 lines of code
