# Phase 3: PR lifecycle timestamps

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add prCreatedAt, prMergedAt, prReviewDurationMs to Feature. Set timestamps at PR creation and merge.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/feature.ts`
- [ ] `apps/server/src/services/git-workflow-service.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] PR timestamp fields added to Feature type
- [ ] prCreatedAt set when PR is created
- [ ] prMergedAt set when PR is merged
- [ ] prReviewDurationMs computed from the difference

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
