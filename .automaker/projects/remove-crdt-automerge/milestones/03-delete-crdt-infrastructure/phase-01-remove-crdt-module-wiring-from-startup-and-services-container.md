# Phase 1: Remove CRDT module wiring from startup and services container

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove CRDT initialization from startup.ts and services.ts (CRDTStore and CrdtSyncService startup calls, setCrdtStore() injection calls). Delete crdt-store.module.ts and crdt-sync.module.ts entirely.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/server/startup.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/services/crdt-store.module.ts`
- [ ] `apps/server/src/services/crdt-sync.module.ts`

### Verification
- [ ] Server starts without errors
- [ ] No CRDTStore or crdtSyncService references in startup.ts or services.ts
- [ ] crdt-store.module.ts and crdt-sync.module.ts deleted
- [ ] TypeScript compiles with no errors

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
