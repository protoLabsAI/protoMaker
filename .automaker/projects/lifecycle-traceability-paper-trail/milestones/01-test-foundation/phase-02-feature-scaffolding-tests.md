# Phase 2: Feature scaffolding tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write unit tests for orchestrateProjectFeatures() and ProjectService.createFeaturesFromProject() verifying that features created from project phases receive: projectSlug, milestoneSlug, phaseSlug, epicId, dependencies, branchName, isFoundation. Test should currently FAIL for milestoneSlug and phaseSlug (documenting the bug). Mock FeatureLoader.create() and capture the arguments passed.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/services/project-orchestration-service.test.ts`
- [ ] `apps/server/tests/unit/services/project-service.test.ts`

### Verification
- [ ] Test captures feature creation args and asserts milestoneSlug is set (should fail — documents bug)
- [ ] Test captures feature creation args and asserts phaseSlug is set (should fail — documents bug)
- [ ] Test verifies projectSlug, epicId, dependencies are set correctly (should pass)
- [ ] Both creation paths (orchestration service and project service) are tested
- [ ] All tests run with npm run test:server

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
