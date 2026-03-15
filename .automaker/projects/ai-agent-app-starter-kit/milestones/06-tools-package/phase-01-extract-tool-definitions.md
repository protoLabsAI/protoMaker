# Phase 1: Extract tool definitions, registry, and adapters

_AI Agent App Starter Kit > Tools Package — Define Once, Deploy Everywhere_

Create packages/tools/ in the starter kit. Extract defineSharedTool factory, ToolRegistry class, and SharedTool/ToolResult/ToolContext interfaces from libs/tools/src/. Strip automaker-specific types (Feature, FeatureStatus, ListFeaturesInput, CompactFeature) from ToolContext — make it generic Record<string, unknown>. Extract all 3 adapters: toMCPTool (MCP adapter), toLangGraphTool (LangGraph adapter), toExpressRouter (Express adapter). Include zod and zod-to-json-schema as dependencies. Create example tools (get_weather, search_web) showing the define-once pattern.

**Complexity:** large

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/tools/src/define-tool.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/registry.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/types.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/adapters/mcp-adapter.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/adapters/langgraph-adapter.ts
- libs/templates/starters/ai-agent-app/packages/tools/src/adapters/express-adapter.ts

## Acceptance Criteria

- [ ] defineSharedTool creates tools with Zod validation
- [ ] ToolRegistry register/execute/getByCategory works
- [ ] toMCPTool converts to JSON Schema format
- [ ] toLangGraphTool converts to DynamicStructuredTool
- [ ] toExpressRouter creates Express routes with validation
- [ ] Zero @protolabsai imports
- [ ] Example tools demonstrate the pattern
