# Phase 2: Populate lifecycle timestamps

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Set createdAt in create(), completedAt on done/verified, reviewStartedAt on review. Push StatusTransition on every status change. Backward compat: undefined fields don't break existing features.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/feature-loader.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] createdAt set in FeatureLoader.create()
- [ ] completedAt set when status changes to done or verified
- [ ] reviewStartedAt set when status changes to review
- [ ] StatusTransition pushed on every status change
- [ ] Existing features without new fields load without error

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
