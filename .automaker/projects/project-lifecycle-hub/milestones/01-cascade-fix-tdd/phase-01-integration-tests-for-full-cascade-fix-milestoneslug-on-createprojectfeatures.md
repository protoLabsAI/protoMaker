# Phase 1: Integration tests for full cascade + fix milestoneSlug on createProjectFeatures

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. First write a failing integration test in apps/server/tests/integration/services/project-cascade.integration.test.ts that: (1) creates a project with 2 milestones and 2 features each, (2) marks all features done, (3) asserts milestone:completed fired for each milestone, (4) asserts project:completed fired once. The test will fail because createProjectFeatures does not set milestoneSlug on features. Then fix apps/server/src/services/project-orchestration-service.ts to pass milestoneSlug and phaseSlug when calling featureLoader.create(). Verify the test goes green. Also check that CompletionDetectorService.checkMilestoneCompletion() correctly groups features by milestoneSlug — fix if needed.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-orchestration-service.ts`
- [ ] `apps/server/src/services/completion-detector-service.ts`
- [ ] `apps/server/tests/integration/services/project-cascade.integration.test.ts`

### Verification
- [ ] Integration test proves full cascade: feature:done → epic:done → milestone:completed → project:completed
- [ ] createProjectFeatures sets milestoneSlug and phaseSlug on all created features
- [ ] CompletionDetectorService correctly groups by milestoneSlug for milestone completion check
- [ ] All new and existing tests pass
- [ ] Build passes

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
