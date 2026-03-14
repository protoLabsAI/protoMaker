# Phase 2: Rename CrdtSyncService to PeerMeshService

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Rename crdt-sync-service.ts to peer-mesh-service.ts. Update class name from CrdtSyncService to PeerMeshService. Update all import references across the codebase. Rename test file to peer-mesh-service.test.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `apps/server/src/server/startup.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/tests/unit/crdt-sync-service.test.ts`

### Verification
- [ ] crdt-sync-service.ts renamed to peer-mesh-service.ts
- [ ] Class exported as PeerMeshService
- [ ] All imports updated
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
