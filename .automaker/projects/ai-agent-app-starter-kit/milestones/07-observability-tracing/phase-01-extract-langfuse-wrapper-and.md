# Phase 1: Extract Langfuse wrapper and built-in tracing

*AI Agent App Starter Kit > Observability — Langfuse + Built-in Tracing*

Create packages/tracing/ in the starter kit. Extract LangfuseClient wrapper, wrapProviderWithTracing, calculateCost with pricing table, and all tracing types from libs/observability/. Replace createLogger calls with a logger parameter (default to console). Add built-in file-based trace logger that writes JSON traces to .traces/ directory for local debugging without Langfuse. Add trace viewer data endpoint to the server (GET /api/traces). Langfuse is opt-in via env vars — when not configured, built-in file tracing is the default.

**Complexity:** large

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/tracing/src/langfuse-client.ts
- libs/templates/starters/ai-agent-app/packages/tracing/src/middleware.ts
- libs/templates/starters/ai-agent-app/packages/tracing/src/file-tracer.ts
- libs/templates/starters/ai-agent-app/packages/tracing/src/types.ts
- libs/templates/starters/ai-agent-app/packages/server/src/routes/traces.ts

## Acceptance Criteria

- [ ] LangfuseClient works when configured, returns null when not
- [ ] Built-in file tracer writes JSON to .traces/
- [ ] calculateCost works for Claude/GPT/Gemini models
- [ ] GET /api/traces returns trace data for viewer
- [ ] Zero @protolabsai imports