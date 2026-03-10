# Phase 1: Unify ChatMessageMarkdown Rendering Path

*Ava Chat Interactive Toolkit > Chat Render Pipeline*

Remove the static marked.parse()+dangerouslySetInnerHTML path from ChatMessageMarkdown. Completed messages currently lose all custom renderers (links, CodeBlock, tables, citations) because they switch away from ReactMarkdown. Unify so both streaming and completed states go through the same ReactMarkdown pipeline with custom components. Remove the marked dependency if it becomes unused.

**Complexity:** medium

## Files to Modify

- libs/ui/src/ai/chat-message-markdown.tsx
- libs/ui/src/ai/index.ts

## Acceptance Criteria

- [ ] Completed messages render links, code blocks, and tables identically to streaming messages
- [ ] No dangerouslySetInnerHTML usage in chat-message-markdown.tsx
- [ ] Custom renderers (CodeBlock, link, table) apply in all message states
- [ ] No regression in streaming rendering