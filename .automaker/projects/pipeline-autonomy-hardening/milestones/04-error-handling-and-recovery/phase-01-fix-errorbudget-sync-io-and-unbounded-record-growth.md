# Phase 1: Fix ErrorBudget sync IO and unbounded record growth

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

ErrorBudgetService uses readFileSync/writeFileSync on every operation blocking the event loop. Records grow without bound. Fix: in-memory cache with async I/O, prune old records, fix exhaustion event threshold mismatch, persist \_isExhaustedState.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/error-budget-service.ts`
- [ ] `apps/server/tests/unit/services/error-budget-service.test.ts`

### Verification

- [ ] All filesystem ops are async
- [ ] Records older than 2x windowMs pruned on write
- [ ] Exhaustion event fires at same threshold as isExhausted()
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
