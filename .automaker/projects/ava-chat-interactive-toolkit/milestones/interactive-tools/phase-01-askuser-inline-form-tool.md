# Phase 1: ask_user Inline Form Tool — Server Side

*Ava Chat Interactive Toolkit > Interactive Tools*

Register the request_user_input tool in ava-tools.ts so Ava can call it during chat sessions. The tool already exists in libs/tools/ and the MCP server but is not wired into Ava's tool list. When called, it should emit a structured event (type: user_input_request) with a JSON Schema form definition over the WebSocket stream so the UI can render an inline form. The tool should pause and await the user's form submission response before returning.

**Complexity:** medium

## Files to Modify

- apps/server/src/services/ava-tools.ts
- apps/server/src/providers/claude-provider.ts
- apps/server/src/lib/events.ts

## Acceptance Criteria

- [ ] request_user_input tool appears in Ava's tool list
- [ ] Calling the tool emits a user_input_request event over WebSocket
- [ ] Tool execution pauses until the user submits the form
- [ ] Form response is returned as the tool result