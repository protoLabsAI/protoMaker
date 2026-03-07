# Phase 3: End-to-end cascade integration test

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write an integration test that creates a mini project with 2 milestones, each with 2 phase features. Mark features as done one by one and verify: epic completion fires, milestone completion fires after all phase features done, project completion fires after all milestones done, ceremony state machine transitions from milestone_active → milestone_retro → milestone_active → project_retro. Use real (not mocked) CompletionDetectorService and CeremonyStateMachine.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/integration/services/lifecycle-cascade.integration.test.ts`

### Verification
- [ ] Integration test creates project with 2 milestones x 2 phases
- [ ] Marking all M1 features done triggers milestone:completed for M1
- [ ] Marking all M2 features done triggers milestone:completed for M2 AND project:completed
- [ ] Ceremony state transitions verified at each step
- [ ] Test runs with npm run test:server
- [ ] No flaky timing issues — uses event listeners not polling

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
