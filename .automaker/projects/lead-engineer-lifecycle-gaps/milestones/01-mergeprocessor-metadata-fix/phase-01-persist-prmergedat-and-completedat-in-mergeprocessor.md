# Phase 1: Persist prMergedAt and completedAt in MergeProcessor

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In lead-engineer-review-merge-processors.ts MergeProcessor.process(), after confirming merge at line 379 (mergeCheck.trim() === 'true'), update the feature with prMergedAt: new Date().toISOString() and completedAt: new Date().toISOString() alongside the existing status: 'done' update at line 391. Also compute prReviewDurationMs if ctx.feature.prCreatedAt is available. Add unit test verifying prMergedAt is set after successful merge.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/lead-engineer-review-merge-processors.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-review-merge-processors.test.ts`

### Verification
- [ ] Feature updated with prMergedAt timestamp on successful merge
- [ ] completedAt set on the feature
- [ ] prReviewDurationMs calculated when prCreatedAt available
- [ ] Unit test confirms prMergedAt is written
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
