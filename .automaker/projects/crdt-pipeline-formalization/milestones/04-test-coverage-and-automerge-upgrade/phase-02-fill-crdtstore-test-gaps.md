# Phase 2: Fill CRDTStore test gaps

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add missing test cases to libs/crdt/src/__tests__/crdt-store.test.ts. Tests to add: (1) Compaction checkpoint — call compact(), verify checkpoint files are written to storageDir/checkpoints/ for each loaded document handle. (2) Filesystem hydration — on first init with a hydrationFn, verify the function is called exactly once; on subsequent init (registry already populated), verify hydrationFn is NOT called. (3) Registry persistence — create document, close store, re-init, verify the same Automerge URL is returned from the registry (not a new document).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/src/__tests__/crdt-store.test.ts`

### Verification
- [ ] Compaction test: checkpoint files exist on disk after compact() call
- [ ] Hydration test: hydrationFn called once on fresh init, not called on subsequent init
- [ ] Registry persistence test: same URL returned after store close and re-init
- [ ] All new tests pass with npm run test:packages
- [ ] No existing tests broken

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
