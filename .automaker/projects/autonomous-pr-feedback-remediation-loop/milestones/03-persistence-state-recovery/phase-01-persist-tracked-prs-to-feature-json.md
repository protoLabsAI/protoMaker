# Phase 1: Persist tracked PRs to feature.json

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Store trackedPRs state in feature.json fields (prTrackedSince, prLastPolledAt) and restore on service init

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`
- [ ] `libs/types/src/feature.ts`

### Verification
- [ ] Feature type has prTrackedSince and prLastPolledAt timestamp fields
- [ ] On PR creation, save tracking metadata to feature.json
- [ ] On service init, restore tracking for features with status=review and prNumber set
- [ ] Restored PRs resume polling from last state
- [ ] Test: server restart doesn't lose PR tracking

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
