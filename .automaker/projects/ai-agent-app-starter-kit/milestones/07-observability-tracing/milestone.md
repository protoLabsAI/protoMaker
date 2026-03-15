# Observability — Langfuse + Built-in Tracing

_Part of: AI Agent App Starter Kit_

Extract the Langfuse tracing wrapper from libs/observability/ and add built-in debug tracing for easy agent debugging without requiring external services.

**Status:** undefined

## Phases

### 1. Extract Langfuse wrapper and built-in tracing

Create packages/tracing/ in the starter kit. Extract LangfuseClient wrapper, wrapProviderWithTracing, calculateCost with pricing table, and all tracing types from libs/observability/. Replace createLogger calls with a logger parameter (default to console). Add built-in file-based trace logger that writes JSON traces to .traces/ directory for local debugging without Langfuse. Add trace viewer data endpoint to the server (GET /api/traces). Langfuse is opt-in via env vars — when not configured, built-in file tracing is the default.

**Complexity:** large

**Files:**

- libs/templates/starters/ai-agent-app/packages/tracing/src/langfuse-client.ts
- libs/templates/starters/ai-agent-app/packages/tracing/src/middleware.ts
- libs/templates/starters/ai-agent-app/packages/tracing/src/file-tracer.ts
- libs/templates/starters/ai-agent-app/packages/tracing/src/types.ts
- libs/templates/starters/ai-agent-app/packages/server/src/routes/traces.ts

**Acceptance Criteria:**

- [ ] LangfuseClient works when configured, returns null when not
- [ ] Built-in file tracer writes JSON to .traces/
- [ ] calculateCost works for Claude/GPT/Gemini models
- [ ] GET /api/traces returns trace data for viewer
- [ ] Zero @protolabsai imports

### 2. Build trace viewer UI route

Create /traces route in packages/app with a trace viewer showing: trace timeline, token usage per turn, cost breakdown, tool call details, latency waterfall. Read from GET /api/traces. Simple table + detail view — not a full Langfuse clone, just enough for local debugging.

**Complexity:** medium

**Files:**

- libs/templates/starters/ai-agent-app/packages/app/src/routes/traces.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/trace-viewer.tsx

**Acceptance Criteria:**

- [ ] Trace list shows recent conversations
- [ ] Trace detail shows turns with token counts
- [ ] Tool calls shown with input/output and timing
- [ ] Cost displayed per trace and per turn
