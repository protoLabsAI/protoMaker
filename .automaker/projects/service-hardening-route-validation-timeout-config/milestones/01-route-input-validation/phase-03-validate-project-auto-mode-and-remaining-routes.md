# Phase 3: Validate project, auto-mode, and remaining routes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add Zod schemas to project CRUD routes, auto-mode start/stop/reconcile, session routes, setup routes, and webhook routes. Special attention to GitHub webhook route which accepts external payloads.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/routes/projects/routes/create.ts`
- [ ] `apps/server/src/routes/projects/routes/update.ts`
- [ ] `apps/server/src/routes/projects/routes/get.ts`
- [ ] `apps/server/src/routes/projects/routes/create-features.ts`
- [ ] `apps/server/src/routes/auto-mode/routes/start.ts`
- [ ] `apps/server/src/routes/auto-mode/routes/reconcile.ts`
- [ ] `apps/server/src/routes/github/routes/webhook.ts`
- [ ] `apps/server/src/routes/setup/routes/verify-claude-auth.ts`
- [ ] `apps/server/src/routes/sessions/routes/index.ts`

### Verification

- [ ] All listed routes use validateBody or validateQuery middleware
- [ ] GitHub webhook validates payload structure before processing
- [ ] maxConcurrency in auto-mode start has numeric range validation (1-20)
- [ ] No `as` type assertions for req.body remain in any route file
- [ ] Build and tests pass

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
