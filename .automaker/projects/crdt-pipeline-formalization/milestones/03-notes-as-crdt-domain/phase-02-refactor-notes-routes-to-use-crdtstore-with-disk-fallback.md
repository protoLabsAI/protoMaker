# Phase 2: Refactor notes routes to use CRDTStore with disk fallback

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Refactor the notes route handlers in apps/server/src/routes/notes/index.ts to use CRDTStore when available, with fallback to disk (current behavior) when CRDT is not initialized. For reads: use store.subscribe() or store.getOrCreate() to read from the Automerge document. For writes (create-tab, write-tab, update-tab, delete-tab): use store.change() to mutate the Automerge document AND write to disk (dual-write for backwards compat). Emit notes:tab-updated event after mutations as before. The disk workspace.json remains as a local backup/fallback.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/notes/index.ts`

### Verification
- [ ] get-workspace and list-tabs routes read from CRDT document when available
- [ ] create-tab, write-tab, delete-tab, rename-tab routes call store.change() for mutations
- [ ] All mutations still write to disk workspace.json as fallback
- [ ] When CRDT is not available (no proto.config.yaml), routes fall back to disk-only behavior
- [ ] notes:tab-updated event emitted after every mutation as before
- [ ] Multi-instance scenario: mutation on instance A is visible to instance B via CRDT subscription
- [ ] npm run typecheck passes
- [ ] npm run test:server passes

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
