# Phase 2: Auto-update project status on project:completed + unit tests

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. Write failing unit tests for a new ProjectStatusSyncService (or add to project-pm.module.ts) that subscribes to project:completed and updates the project.json status to 'completed' and sets a completedAt timestamp. The test should mock the event emitter and assert the project file is updated. Then implement the subscription. Also add a test asserting that project:lifecycle:launched sets status to 'active'. Wire into services.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-pm.module.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/tests/unit/services/project-pm.test.ts`

### Verification
- [ ] project:completed event auto-updates project.json status to 'completed' with completedAt timestamp
- [ ] project:lifecycle:launched auto-updates project.json status to 'active'
- [ ] Unit tests prove both transitions
- [ ] All existing project service tests pass
- [ ] Build passes

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
