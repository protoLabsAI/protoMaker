# Phase 2: Remove CRDT types from libs/types and clean up tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove CRDT_SYNCED_EVENT_TYPES and CrdtSyncWireMessage from libs/types/src/events.ts. Remove unused CRDT types from hivemind.ts. Update libs/types/src/index.ts. Delete crdt-store-module.test.ts. Update ava-channel-service.test.ts to remove CRDT mock setup. Run full typecheck.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/events.ts`
- [ ] `libs/types/src/hivemind.ts`
- [ ] `libs/types/src/index.ts`
- [ ] `apps/server/tests/unit/services/crdt-store-module.test.ts`
- [ ] `apps/server/tests/unit/services/ava-channel-service.test.ts`

### Verification
- [ ] No CRDT_SYNCED_EVENT_TYPES or CrdtSyncWireMessage in libs/types
- [ ] crdt-store-module.test.ts deleted
- [ ] npm run typecheck passes
- [ ] npm run test:all passes
- [ ] npm run build:server succeeds

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
