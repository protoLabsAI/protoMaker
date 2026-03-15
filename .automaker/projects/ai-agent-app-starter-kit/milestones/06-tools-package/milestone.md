# Tools Package — Define Once, Deploy Everywhere

*Part of: AI Agent App Starter Kit*

Extract the defineSharedTool, ToolRegistry, and adapter system (MCP, LangGraph, Express) from libs/tools/ into the starter kit. This is the foundation that all other packages build on.

**Status:** undefined

## Phases

### 1. Extract tool definitions, registry, and adapters

Create packages/tools/ in the starter kit. Extract defineSharedTool factory, ToolRegistry class, and SharedTool/ToolResult/ToolContext interfaces from libs/tools/src/. Strip automaker-specific types (Feature, FeatureStatus, ListFeaturesInput, CompactFeature) from ToolContext — make it generic Record<string, unknown>. Extract all 3 adapters: toMCPTool (MCP adapter), toLangGraphTool (LangGraph adapter), toExpressRouter (Express adapter). Include zod and zod-to-json-schema as dependencies. Create example tools (get_weather, search_web) showing the define-once pattern.

**Complexity:** large

**Files:**
- libs/templates/starters/ai-agent-app/packages/tools/src/define-tool.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/registry.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/types.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/adapters/mcp-adapter.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/adapters/langgraph-adapter.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/adapters/express-adapter.ts

**Acceptance Criteria:**
- [ ] defineSharedTool creates tools with Zod validation
- [ ] ToolRegistry register/execute/getByCategory works
- [ ] toMCPTool converts to JSON Schema format
- [ ] toLangGraphTool converts to DynamicStructuredTool
- [ ] toExpressRouter creates Express routes with validation
- [ ] Zero @protolabsai imports
- [ ] Example tools demonstrate the pattern

### 2. Wire tools package into server chat route

Update packages/server to use the tools package instead of inline tool definitions. Import defineSharedTool and ToolRegistry. Register example tools. Update chat route to pull tools from registry and convert to AI SDK format. Add tool profiles (execution, orchestration, review) as an optional pattern.

**Complexity:** medium

**Files:**
- libs/templates/starters/ai-agent-app/packages/server/src/routes/chat.ts
- libs/templates/starters/ai-agent-app/packages/server/src/tools/registry.ts
- libs/templates/starters/ai-agent-app/packages/server/src/tools/example.ts

**Acceptance Criteria:**
- [ ] Chat route uses ToolRegistry for tool resolution
- [ ] Tools defined with defineSharedTool work in chat
- [ ] Tool profiles documented as optional pattern
