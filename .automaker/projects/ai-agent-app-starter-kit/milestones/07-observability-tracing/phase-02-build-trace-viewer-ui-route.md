# Phase 2: Build trace viewer UI route

_AI Agent App Starter Kit > Observability — Langfuse + Built-in Tracing_

Create /traces route in packages/app with a trace viewer showing: trace timeline, token usage per turn, cost breakdown, tool call details, latency waterfall. Read from GET /api/traces. Simple table + detail view — not a full Langfuse clone, just enough for local debugging.

**Complexity:** medium

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/app/src/routes/traces.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/trace-viewer.tsx

## Acceptance Criteria

- [ ] Trace list shows recent conversations
- [ ] Trace detail shows turns with token counts
- [ ] Tool calls shown with input/output and timing
- [ ] Cost displayed per trace and per turn
