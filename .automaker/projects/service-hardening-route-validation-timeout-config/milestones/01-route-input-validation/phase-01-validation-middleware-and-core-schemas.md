# Phase 1: Validation middleware and core schemas

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a `validateBody` Express middleware using Zod. Define shared schemas for common request patterns: `projectPathSchema`, `featureIdSchema`, `paginationSchema`. Apply to 3 high-traffic routes (feature get, feature list, health) as proof of concept.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/lib/validation.ts`
- [ ] `apps/server/src/routes/features/routes/get.ts`
- [ ] `apps/server/src/routes/features/routes/list.ts`
- [ ] `apps/server/src/routes/health/routes/index.ts`

### Verification

- [ ] validateBody middleware returns 400 with Zod error details on invalid input
- [ ] projectPathSchema validates string, non-empty, absolute path
- [ ] Applied to feature get/list routes — type assertions replaced
- [ ] Existing tests pass without modification
- [ ] Build succeeds

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
