# Phase 1: Add git-workflow-service unit tests

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

git-workflow-service.ts is 1660 lines with zero dedicated tests. Cover: runPostCompletionWorkflow, commit/push failure handling, PR creation, format pipeline, activeWorkflows counter, merge strategy resolution.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/tests/unit/services/git-workflow-service.test.ts`

### Verification

- [ ] Tests cover success and failure paths for post-completion workflow
- [ ] Tests cover counter management including error paths
- [ ] Tests cover merge strategy for dev, staging, main, epic branches
- [ ] At least 15 test cases
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
