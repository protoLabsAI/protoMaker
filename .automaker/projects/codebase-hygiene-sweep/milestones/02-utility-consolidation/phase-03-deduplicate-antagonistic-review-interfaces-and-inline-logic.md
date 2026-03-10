# Phase 3: Deduplicate antagonistic review interfaces and inline logic

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Move ReviewResult, ConsolidatedReview, ReviewRequest to libs/types/. Consolidate duplicate PRD extraction logic into single function. Extract ceremony stat aggregation helper. Replace IntakeProcessor inline dep check with getBlockingDependencies().

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/antagonistic-review.ts`
- [ ] `libs/types/src/index.ts`
- [ ] `apps/server/src/services/antagonistic-review-service.ts`
- [ ] `apps/server/src/services/antagonistic-review-adapter.ts`
- [ ] `apps/server/src/routes/ceremonies/index.ts`
- [ ] `apps/server/src/services/lead-engineer-processors.ts`

### Verification
- [ ] Interfaces defined once in libs/types/
- [ ] Single PRD extraction function
- [ ] Ceremony stats extracted to helper
- [ ] IntakeProcessor uses getBlockingDependencies()
- [ ] npm run build:packages passes
- [ ] npm run test:all passes

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
