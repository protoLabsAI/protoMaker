# Phase 2: Build Zustand session store and useChatSession hook

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create session-store.ts with Zustand persist middleware (localStorage). ChatSession with id, title, messages (UIMessage[]), model, timestamps. Max 50 sessions with LRU eviction. Create use-chat-session.ts coordinating AI SDK useChat with Zustand via DefaultChatTransport.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/ai-agent-app/packages/app/src/store/session-store.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/app/src/hooks/use-chat-session.ts`

### Verification
- [ ] Sessions persist across page reload
- [ ] Max 50 sessions with LRU eviction
- [ ] useChat coordinates with Zustand store
- [ ] Model selection flows through to server

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
