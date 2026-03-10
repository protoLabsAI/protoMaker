# Phase 2: Auto-Expand Tool Result Cards on Completion

*Ava Chat Interactive Toolkit > Chat Render Pipeline*

Tool result cards (ToolCallBlock / tool-result-registry components) currently stay collapsed after streaming ends. When a tool transitions to output-available state, auto-expand the result card. The collapsed state should only be the default for cards that haven't finished yet. Add a prop or state that tracks whether the card has been auto-expanded so manual collapse is preserved on re-renders.

**Complexity:** small

## Files to Modify

- libs/ui/src/ai/tool-call-block.tsx
- libs/ui/src/ai/tool-result-registry.tsx
- apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx

## Acceptance Criteria

- [ ] Tool result cards auto-expand when tool transitions to output-available
- [ ] Manual collapse by user is preserved (no re-expand on re-render)
- [ ] In-progress tool calls remain collapsed by default
- [ ] No layout jump during auto-expand