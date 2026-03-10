# Phase 3: Markdown Styling Audit and Token Cleanup

*Ava Chat Interactive Toolkit > Chat Render Pipeline*

Audit all markdown-related styling in the chat overlay and ChatMessageMarkdown component. Replace any hardcoded color classes (bg-gray-*, text-blue-*, border-slate-*) with semantic design tokens (bg-card, text-foreground, border-border, text-muted-foreground, etc.). Ensure code blocks, blockquotes, tables, links, and list items all use brand-consistent token-based styling.

**Complexity:** small

## Files to Modify

- libs/ui/src/ai/chat-message-markdown.tsx
- libs/ui/src/ai/code-block.tsx
- apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx
- apps/ui/src/components/views/chat-overlay/ava-channel-tab.tsx

## Acceptance Criteria

- [ ] No hardcoded color classes in any markdown rendering component
- [ ] All elements use semantic tokens (text-foreground, text-muted-foreground, bg-card, border-border, etc.)
- [ ] Code blocks, blockquotes, tables, and links are on-brand in both light and dark mode
- [ ] No visual regressions in message rendering