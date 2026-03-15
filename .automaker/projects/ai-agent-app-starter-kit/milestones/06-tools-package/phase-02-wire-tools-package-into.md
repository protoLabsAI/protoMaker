# Phase 2: Wire tools package into server chat route

*AI Agent App Starter Kit > Tools Package — Define Once, Deploy Everywhere*

Update packages/server to use the tools package instead of inline tool definitions. Import defineSharedTool and ToolRegistry. Register example tools. Update chat route to pull tools from registry and convert to AI SDK format. Add tool profiles (execution, orchestration, review) as an optional pattern.

**Complexity:** medium

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/server/src/routes/chat.ts
- libs/templates/starters/ai-agent-app/packages/server/src/tools/registry.ts
- libs/templates/starters/ai-agent-app/packages/server/src/tools/example.ts

## Acceptance Criteria

- [ ] Chat route uses ToolRegistry for tool resolution
- [ ] Tools defined with defineSharedTool work in chat
- [ ] Tool profiles documented as optional pattern