# Interactive Tools

*Part of: Ava Chat Interactive Toolkit*

Add ask_user inline form tool (HITL), message_instance backchannel tool with response waiting, and fix watch_pr session scoping with in-chat notification.

**Status:** planned
**Dependencies:** chat-render-pipeline

## Phases

### 1. ask_user Inline Form Tool — Server Side

Register the request_user_input tool in ava-tools.ts so Ava can call it during chat sessions. The tool already exists in libs/tools/ and the MCP server but is not wired into Ava's tool list. When called, it should emit a structured event (type: user_input_request) with a JSON Schema form definition over the WebSocket stream so the UI can render an inline form. The tool should pause and await the user's form submission response before returning.

**Complexity:** medium

**Files:**
- apps/server/src/services/ava-tools.ts
- apps/server/src/providers/claude-provider.ts
- apps/server/src/lib/events.ts

**Acceptance Criteria:**
- [ ] request_user_input tool appears in Ava's tool list
- [ ] Calling the tool emits a user_input_request event over WebSocket
- [ ] Tool execution pauses until the user submits the form
- [ ] Form response is returned as the tool result

### 2. ask_user Inline Form Tool — UI Renderer

Render inline JSON Schema forms in the chat when Ava calls ask_user. When a user_input_request event arrives, render an InlineFormCard using RJSF (@rjsf/shadcn + @rjsf/validator-ajv8) inside the tool call block. The form should submit back to the server via the existing chat WebSocket message channel. Wire this into the tool-result-registry so ask_user / request_user_input renders the form component instead of raw JSON.

**Complexity:** medium

**Files:**
- libs/ui/src/ai/tool-result-registry.tsx
- apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx
- apps/ui/src/components/views/chat-overlay/inline-form-card.tsx

**Acceptance Criteria:**
- [ ] ask_user tool call renders an interactive JSON Schema form in chat
- [ ] Form submission sends the response back to the server
- [ ] Form is disabled/locked after submission
- [ ] Uses RJSF with shadcn theme and semantic design tokens

### 3. message_instance Backchannel Tool with Response Waiting

Add a message_instance tool to Ava's tool list that sends a message to another instance via the Ava channel and waits for a response. Uses the existing send_channel_message MCP tool and read_channel_messages to poll for a reply. The tool should accept: instanceId (target), message (string), timeout_ms (default 60000). It sends a structured backchannel message with a correlation ID, polls for a response message from the target instance that references the correlation ID, and returns the response content. Register in ava-tools.ts.

**Complexity:** large

**Files:**
- apps/server/src/services/ava-tools.ts
- apps/server/src/services/ava-channel-service.ts
- apps/server/src/routes/ava-channel/

**Acceptance Criteria:**
- [ ] message_instance tool appears in Ava's tool list
- [ ] Tool sends a backchannel message with a correlation ID
- [ ] Tool polls for a response from the target instance
- [ ] Tool returns the response content or a timeout error
- [ ] Staging instance can receive and respond to backchannel messages

### 4. Fix watch_pr Session Scoping and In-Chat Notification

PRWatcherService is fully implemented but broadcasts PR status updates to ALL clients instead of the originating chat session. Scope PR watch notifications to the sessionId that called watch_pr. When a PR status changes (merged, approved, changes requested), send an in-chat notification message back to that specific session rather than a global broadcast. Also fix the dead-end: if Ava says it will watch a PR, the tool should keep the conversation alive by posting a follow-up message when the PR resolves.

**Complexity:** medium

**Files:**
- apps/server/src/services/pr-watcher-service.ts
- apps/server/src/services/ava-tools.ts
- apps/server/src/routes/ava/

**Acceptance Criteria:**
- [ ] PR watch notifications are scoped to the originating session
- [ ] Other chat sessions do not receive PR notifications they did not request
- [ ] When a watched PR resolves, an in-chat message is sent to the correct session
- [ ] Ava does not dead-end after offering to watch a PR
