# Phase 2: ask_user Inline Form Tool — UI Renderer

*Ava Chat Interactive Toolkit > Interactive Tools*

Render inline JSON Schema forms in the chat when Ava calls ask_user. When a user_input_request event arrives, render an InlineFormCard using RJSF (@rjsf/shadcn + @rjsf/validator-ajv8) inside the tool call block. The form should submit back to the server via the existing chat WebSocket message channel. Wire this into the tool-result-registry so ask_user / request_user_input renders the form component instead of raw JSON.

**Complexity:** medium

## Files to Modify

- libs/ui/src/ai/tool-result-registry.tsx
- apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx
- apps/ui/src/components/views/chat-overlay/inline-form-card.tsx

## Acceptance Criteria

- [ ] ask_user tool call renders an interactive JSON Schema form in chat
- [ ] Form submission sends the response back to the server
- [ ] Form is disabled/locked after submission
- [ ] Uses RJSF with shadcn theme and semantic design tokens