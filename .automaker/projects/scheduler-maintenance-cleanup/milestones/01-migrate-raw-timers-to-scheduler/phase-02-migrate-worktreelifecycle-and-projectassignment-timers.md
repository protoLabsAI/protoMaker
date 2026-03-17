# Phase 2: Migrate WorktreeLifecycle and ProjectAssignment timers

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Migrate WorktreeLifecycleModule (5min drift at worktree-lifecycle.module.ts:24), WorktreeLifecycleService (6h drift at worktree-lifecycle-service.ts:142), and ProjectAssignmentService (60s failover at project-assignment-service.ts:264) from raw setInterval to schedulerService.registerInterval(). These are all long-lived system timers.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/worktree-lifecycle.module.ts`
- [ ] `apps/server/src/services/worktree-lifecycle-service.ts`
- [ ] `apps/server/src/services/project-assignment-service.ts`

### Verification
- [ ] All 3 timers visible in Ops Dashboard
- [ ] Drift check behavior unchanged
- [ ] Failover detection behavior unchanged
- [ ] No raw setInterval remains in these files
- [ ] Server tests pass

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
