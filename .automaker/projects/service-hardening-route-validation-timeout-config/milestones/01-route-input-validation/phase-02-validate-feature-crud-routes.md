# Phase 2: Validate feature CRUD routes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add Zod schemas to feature create, update, delete, bulk-update, bulk-delete, move, and rollback routes. Replace all `as` type assertions with validated types from the middleware.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/routes/features/routes/create.ts`
- [ ] `apps/server/src/routes/features/routes/update.ts`
- [ ] `apps/server/src/routes/features/routes/delete.ts`
- [ ] `apps/server/src/routes/features/routes/bulk-update.ts`
- [ ] `apps/server/src/routes/features/routes/bulk-delete.ts`
- [ ] `apps/server/src/routes/features/routes/move.ts`
- [ ] `apps/server/src/routes/features/routes/rollback.ts`

### Verification

- [ ] All 7 feature CRUD routes use validateBody middleware
- [ ] No `as` type assertions remain in these files for req.body
- [ ] Invalid feature updates return 400 not 500
- [ ] Build and tests pass

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
