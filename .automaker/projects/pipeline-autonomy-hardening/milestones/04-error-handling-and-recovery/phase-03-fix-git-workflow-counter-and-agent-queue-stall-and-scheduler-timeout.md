# Phase 3: Fix git workflow counter and agent queue stall and scheduler timeout

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Three small fixes: (1) git-workflow-service activeWorkflows counter not in finally block. (2) agent-service processNextInQueue not called on error. (3) feature-scheduler timeout removes feature without checking runningFeatures.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/git-workflow-service.ts`
- [ ] `apps/server/src/services/agent-service.ts`
- [ ] `apps/server/src/services/feature-scheduler.ts`

### Verification

- [ ] activeWorkflows counter always decrements via finally
- [ ] Agent queue processes next item after error
- [ ] Scheduler timeout checks runningFeatures before removal
- [ ] npm run test:server passes

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
