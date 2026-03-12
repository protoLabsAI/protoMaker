# Phase 1: Categories via event bridge

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add categories:updated to CRDT_SYNCED_EVENT_TYPES in libs/types/src/events.ts. The categories file (.automaker/categories.json) is a simple string array. When a category is added or deleted, the categories route should broadcast the full updated array as a categories:updated event. Add a handler in crdt-sync.module.ts that on receiving a remote categories:updated event, calls the categories service to overwrite local categories (simple LWW for a small config array is correct). This is intentionally NOT a full CRDT domain — it is a 21-byte config value that changes rarely.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/events.ts`
- [ ] `apps/server/src/services/crdt-sync.module.ts`
- [ ] `apps/server/src/routes/categories/index.ts`

### Verification
- [ ] categories:updated is added to CRDT_SYNCED_EVENT_TYPES
- [ ] Categories route broadcasts categories:updated event after every create/delete mutation
- [ ] crdt-sync.module.ts registers a handler for remote categories:updated events
- [ ] Handler overwrites local categories with the remote payload
- [ ] No new CRDT domain added — uses the existing event bridge
- [ ] npm run typecheck passes
- [ ] npm run test:server passes

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
