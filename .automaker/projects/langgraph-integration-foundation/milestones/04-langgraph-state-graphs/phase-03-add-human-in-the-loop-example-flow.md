# Phase 3: Add human-in-the-loop example flow

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Build a review flow with interrupt: START → draft → human_review (interrupt) → revise → END. Demonstrate interruptBefore, getState(), updateState(), resume() patterns. Write tests for approval and rejection paths.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/graphs/review-flow.ts`
- [ ] `libs/flows/src/graphs/nodes/draft.ts`
- [ ] `libs/flows/src/graphs/nodes/revise.ts`
- [ ] `libs/flows/tests/integration/review-flow.test.ts`

### Verification
- [ ] Graph interrupts at human_review node
- [ ] State can be inspected and modified
- [ ] Resume continues from interrupt point
- [ ] Tests validate both approval/rejection
- [ ] 5+ integration tests pass

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
