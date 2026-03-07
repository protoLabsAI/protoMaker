# Phase 2: Work-Stealing Protocol

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When an instance's backlog empties, it requests features from busy peers. Assignment strategy configurable in proto.config: capacity (steal from busiest), domain (steal matching paths only), or manual (never auto-steal). Implements WORK_REQUEST/WORK_OFFER handshake via CRDT ephemeral messages. Feature.assignedInstance field update propagates via CRDT.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/work-stealing-service.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`
- [ ] `libs/types/src/feature.ts`
- [ ] `libs/types/src/proto-config.ts`

### Verification
- [ ] Idle instance broadcasts WORK_REQUEST when backlog hits 0
- [ ] Busy peers respond with WORK_OFFER containing stealable features
- [ ] Feature.assignedInstance updated via CRDT (propagates to all peers)
- [ ] Stolen features appear in receiving instance's auto-mode queue
- [ ] Domain routing: features only offered to instances whose domains match filesToModify
- [ ] stealable:false features never offered
- [ ] Configurable stealMax limits features stolen per cycle
- [ ] Manual mode disables automatic stealing (features must be explicitly assigned)

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
