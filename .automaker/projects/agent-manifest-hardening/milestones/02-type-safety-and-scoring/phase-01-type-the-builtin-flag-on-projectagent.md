# Phase 1: Type the _builtIn flag on ProjectAgent

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add _builtIn?: boolean to the ProjectAgent type in agent-manifest.ts. Remove the unsafe casts in routes/agents.ts and the UI's agent-suggestion.tsx.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/agent-manifest.ts`
- [ ] `apps/server/src/routes/agents.ts`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/agent-suggestion.tsx`

### Verification
- [ ] No more 'as unknown as' casts for _builtIn
- [ ] TypeScript compiles cleanly
- [ ] UI displays built-in badge correctly

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
