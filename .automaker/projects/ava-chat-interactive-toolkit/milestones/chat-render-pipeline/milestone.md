# Chat Render Pipeline

*Part of: Ava Chat Interactive Toolkit*

Fix the dual-path markdown rendering bug, auto-expand tool result cards on completion, and audit all markdown styling to use semantic design tokens.

**Status:** planned

## Phases

### 1. Unify ChatMessageMarkdown Rendering Path

Remove the static marked.parse()+dangerouslySetInnerHTML path from ChatMessageMarkdown. Completed messages currently lose all custom renderers (links, CodeBlock, tables, citations) because they switch away from ReactMarkdown. Unify so both streaming and completed states go through the same ReactMarkdown pipeline with custom components. Remove the marked dependency if it becomes unused.

**Complexity:** medium

**Files:**
- libs/ui/src/ai/chat-message-markdown.tsx
- libs/ui/src/ai/index.ts

**Acceptance Criteria:**
- [ ] Completed messages render links, code blocks, and tables identically to streaming messages
- [ ] No dangerouslySetInnerHTML usage in chat-message-markdown.tsx
- [ ] Custom renderers (CodeBlock, link, table) apply in all message states
- [ ] No regression in streaming rendering

### 2. Auto-Expand Tool Result Cards on Completion

Tool result cards (ToolCallBlock / tool-result-registry components) currently stay collapsed after streaming ends. When a tool transitions to output-available state, auto-expand the result card. The collapsed state should only be the default for cards that haven't finished yet. Add a prop or state that tracks whether the card has been auto-expanded so manual collapse is preserved on re-renders.

**Complexity:** small

**Files:**
- libs/ui/src/ai/tool-call-block.tsx
- libs/ui/src/ai/tool-result-registry.tsx
- apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx

**Acceptance Criteria:**
- [ ] Tool result cards auto-expand when tool transitions to output-available
- [ ] Manual collapse by user is preserved (no re-expand on re-render)
- [ ] In-progress tool calls remain collapsed by default
- [ ] No layout jump during auto-expand

### 3. Markdown Styling Audit and Token Cleanup

Audit all markdown-related styling in the chat overlay and ChatMessageMarkdown component. Replace any hardcoded color classes (bg-gray-*, text-blue-*, border-slate-*) with semantic design tokens (bg-card, text-foreground, border-border, text-muted-foreground, etc.). Ensure code blocks, blockquotes, tables, links, and list items all use brand-consistent token-based styling.

**Complexity:** small

**Files:**
- libs/ui/src/ai/chat-message-markdown.tsx
- libs/ui/src/ai/code-block.tsx
- apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx
- apps/ui/src/components/views/chat-overlay/ava-channel-tab.tsx

**Acceptance Criteria:**
- [ ] No hardcoded color classes in any markdown rendering component
- [ ] All elements use semantic tokens (text-foreground, text-muted-foreground, bg-card, border-border, etc.)
- [ ] Code blocks, blockquotes, tables, and links are on-brand in both light and dark mode
- [ ] No visual regressions in message rendering
