# Phase 2: Remove setCrdtStore() from CalendarService, TodoService, and metrics route

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove optional CRDT injection from: (1) calendar-service.ts — remove setCrdtStore(), remove private crdtStore field, remove CRDT paths; (2) todo-service.ts — same pattern; (3) metrics/dora.ts — remove optional crdtStore param and CRDT snapshot merge.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/calendar-service.ts`
- [ ] `apps/server/src/services/todo-service.ts`
- [ ] `apps/server/src/routes/metrics/dora.ts`

### Verification
- [ ] No @protolabsai/crdt imports in these three files
- [ ] setCrdtStore() method removed from CalendarService and TodoService
- [ ] Calendar and todos still read/write from disk
- [ ] TypeScript compiles with no errors

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
