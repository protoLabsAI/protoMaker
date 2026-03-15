# Phase 3: Compose chat view with extracted UI components

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Build the main chat view composing ChatMessageList, ChatMessage, ChatInput, PromptInputProvider from packages/ui. Wire useChatSession hook. Add tool progress subscription via WebSocket. Render ChainOfThought for reasoning, ToolInvocationPart for tool calls, ConfirmationCard for HITL. Create example weather tool result card.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/ai-agent-app/packages/app/src/routes/index.tsx`
- [ ] `libs/templates/starters/ai-agent-app/packages/app/src/hooks/use-tool-progress.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/ui/src/tool-results/weather-card.tsx`

### Verification
- [ ] Chat view renders with all components
- [ ] Streaming messages display in real time
- [ ] Tool invocations render with state badges
- [ ] HITL confirmation works inline
- [ ] Extended reasoning displays
- [ ] Weather tool renders with custom card

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
