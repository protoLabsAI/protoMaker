# Phase 1: Remove dead AutomergeFeatureStore methods and claim protocol

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove applyRemoteChanges() and getDocBinary() from AutomergeFeatureStore — these methods were designed for a feature-sync model that was abandoned in db8801061 and are never called from production code. Remove the 200ms claim settle delay (CLAIM_VERIFY_DELAY_MS) and re-read-after-settle logic from the claim() method — features are local and the Automerge doc is never updated by remote peers, making the settle pointless. Update the corresponding tests to remove test cases for these removed methods. Keep invalidateDoc() and the in-memory Automerge doc (they provide fast local reads).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/automerge-feature-store.ts`
- [ ] `apps/server/tests/unit/services/automerge-feature-store.test.ts`

### Verification
- [ ] applyRemoteChanges() method is removed from AutomergeFeatureStore
- [ ] getDocBinary() method is removed from AutomergeFeatureStore
- [ ] CLAIM_VERIFY_DELAY_MS constant and the 200ms setTimeout/re-read pattern in claim() are removed
- [ ] claim() still correctly returns false if feature.claimedBy is already set to another instanceId
- [ ] No references to removed methods remain in production code
- [ ] Test file updated: removed test cases for applyRemoteChanges and getDocBinary
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
