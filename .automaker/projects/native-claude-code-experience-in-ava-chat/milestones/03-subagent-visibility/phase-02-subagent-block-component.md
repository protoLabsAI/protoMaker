# Phase 2: Subagent Block Component

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create SubagentBlock component in libs/ui that renders subagent-progress parts as collapsible cards. Shows: subagent type badge, status indicator (spinner/checkmark/x), description, and collapsed result summary that expands on click. Register in the tool-result-registry so ChatMessageList renders it automatically for Agent tool results.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/ui/src/ai/subagent-block.tsx`
- [ ] `libs/ui/src/ai/index.ts`
- [ ] `apps/ui/src/components/views/chat-overlay/tool-result-registry.ts`

### Verification
- [ ] SubagentBlock renders for Agent tool results
- [ ] Shows subagent type, status badge, description
- [ ] Result summary collapsible (collapsed by default)
- [ ] Spinner while running, checkmark when done, x on failure
- [ ] Registered in tool-result-registry for automatic rendering

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
