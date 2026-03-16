# Phase 1: Delete dead LangGraph flows and update barrel exports

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete: libs/flows/src/graphs/coordinator-flow.ts, libs/flows/src/graphs/review-flow.ts, libs/flows/src/graphs/interrupt-loop.ts. Delete their test files: libs/flows/tests/integration/coordinator-flow.test.ts, libs/flows/tests/integration/review-flow.test.ts, libs/flows/tests/interrupt-loop.test.ts. Remove the corresponding export lines from libs/flows/src/index.ts (createCoordinatorGraph, CoordinatorState, createReviewFlow, ReviewState, and all interrupt-loop exports). Active flows that must remain: antagonistic-review, content-creation, standup-flow, retro-flow.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/flows/src/graphs/coordinator-flow.ts`
- [ ] `libs/flows/src/graphs/review-flow.ts`
- [ ] `libs/flows/src/graphs/interrupt-loop.ts`
- [ ] `libs/flows/tests/integration/coordinator-flow.test.ts`
- [ ] `libs/flows/tests/integration/review-flow.test.ts`
- [ ] `libs/flows/tests/interrupt-loop.test.ts`
- [ ] `libs/flows/src/index.ts`

### Verification

- [ ] 3 flow files deleted
- [ ] 3 test files deleted
- [ ] index.ts exports no coordinator/review/interrupt-loop symbols
- [ ] Active flows still export correctly
- [ ] npm run build:packages passes
- [ ] npm run test:packages passes

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
