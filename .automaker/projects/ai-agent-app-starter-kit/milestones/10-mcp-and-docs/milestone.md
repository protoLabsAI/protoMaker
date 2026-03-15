# MCP Server + Documentation

_Part of: AI Agent App Starter Kit_

Add an example MCP server using the tools package adapters, and ship comprehensive docs extracted from automaker plus new content.

**Status:** undefined

## Phases

### 1. Create MCP server example

Create packages/mcp/ in the starter kit with a minimal MCP server (~50-80 lines) that: imports Server and StdioServerTransport from @modelcontextprotocol/sdk, loads tools from the tools package registry, converts them using toMCPTool adapter, registers ListToolsRequestSchema and CallToolRequestSchema handlers. Include the example tools (get_weather, search_web) auto-registered. Add a bin entry so users can run it as a CLI. Document how to connect it to Claude Code or other MCP clients.

**Complexity:** medium

**Files:**

- libs/templates/starters/ai-agent-app/packages/mcp/src/index.ts
- libs/templates/starters/ai-agent-app/packages/mcp/package.json

**Acceptance Criteria:**

- [ ] MCP server starts via CLI
- [ ] Lists tools from registry
- [ ] Executes tools via MCP protocol
- [ ] Works with Claude Code as client
- [ ] Under 80 lines of code

### 2. Create docs directory with extracted and new content

Create docs/ at the starter kit root. Extract and genericize docs from automaker: agent-architecture.md, agent-philosophy.md, prompt-engineering.md, reliability.md (from concepts/), writing-prompts.md, flow-control.md, gotchas.md (from guides/), langfuse.md, mcp-integration.md, sdk-integration.md (from integrations/internal). Write new docs: visual-flow-builder.md, trace-viewer.md, prompt-playground.md, creating-mcp-tools.md, tool-adapters.md. Follow Diataxis framework: tutorials in getting-started/, how-tos in guides/, reference in reference/, explanations in concepts/.

**Complexity:** large

**Files:**

- libs/templates/starters/ai-agent-app/docs/getting-started/quickstart.md
- libs/templates/starters/ai-agent-app/docs/concepts/agent-architecture.md
- libs/templates/starters/ai-agent-app/docs/concepts/prompt-engineering.md
- libs/templates/starters/ai-agent-app/docs/guides/creating-tools.md
- libs/templates/starters/ai-agent-app/docs/guides/building-flows.md
- libs/templates/starters/ai-agent-app/docs/guides/tracing-debugging.md
- libs/templates/starters/ai-agent-app/docs/guides/prompt-playground.md
- libs/templates/starters/ai-agent-app/docs/reference/tool-adapters.md
- libs/templates/starters/ai-agent-app/docs/integrations/langfuse.md
- libs/templates/starters/ai-agent-app/docs/integrations/mcp.md

**Acceptance Criteria:**

- [ ] Diataxis structure with 4 content types
- [ ] Extracted docs genericized (no automaker references)
- [ ] New docs cover flow builder, traces, prompts, MCP
- [ ] Quickstart gets user running in 5 minutes
- [ ] All docs follow outcome-focused headings, code-first

### 3. Update README with full platform documentation

Update the root README.md to reflect the expanded platform: all packages (ui, server, app, tools, tracing, flows, prompts, mcp), all routes (/chat, /flows, /prompts, /traces, /sessions, /settings), all features. Add architecture diagram showing how packages connect. Add 'What can I build?' section with examples. Update env vars table with all new configuration (LANGFUSE\_\*, OPENAI_API_KEY, GOOGLE_API_KEY). Add quick links to docs/ for each topic.

**Complexity:** medium

**Files:**

- libs/templates/starters/ai-agent-app/README.md

**Acceptance Criteria:**

- [ ] All 8 packages documented
- [ ] All 6 routes described
- [ ] Architecture diagram included
- [ ] Env vars table complete
- [ ] Quick links to docs/ for deep dives
