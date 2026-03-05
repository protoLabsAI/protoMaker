# Phase 2: Server-side compaction safety net

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add compact_20260112 beta support as a final safety net. When estimated input tokens exceed 130K, enable the compact beta header. Add monitoring to log when compaction activates and how much it reduces. This is the last line of defense before a crash.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/chat/index.ts`

### Verification
- [ ] Compact beta header added when estimated tokens exceed threshold
- [ ] Compaction activation is logged with before/after token estimates
- [ ] Chat survives 100+ message sessions without crashing
- [ ] No regression in short chat sessions
- [ ] TypeScript compiles cleanly

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
