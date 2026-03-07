# Phase 2: Fix standup flow registration

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. The server logs show: Flow not registered: standup-flow when ceremony:standup is triggered. Find where flows are registered (likely apps/server/src/services or the LangGraph flow registry) and ensure createStandupFlow is registered under the key 'standup-flow'. Write a test that confirms the flow registry contains standup-flow, retro-flow, and project-retro-flow before any ceremony triggers. Fix the registration gap.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/tests/unit/services/ceremony-flows.test.ts`

### Verification
- [ ] standup-flow is registered and does not throw 'Flow not registered' error
- [ ] Unit test verifies all 3 ceremony flows are registered on service init
- [ ] Standup ceremony can be triggered via the ceremony route without errors
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
