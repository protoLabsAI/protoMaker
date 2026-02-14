# Phase 1: Replace HITL gates with antagonistic review nodes in content flow

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Modify content-creation-flow.ts to replace the 3 interruptBefore HITL gates with AntagonisticReviewer subgraph calls. Research gate reviews research quality, outline gate reviews outline structure, final gate runs full 8-dimension review on assembled content. Flow runs end-to-end without human intervention by default.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/content-creation-flow.ts`
- [ ] `libs/flows/src/content/content-flow.ts`
- [ ] `libs/flows/src/content/state.ts`

### Verification
- [ ] Flow compiles and runs without MemorySaver/checkpointer by default
- [ ] 3 antagonistic review passes replace 3 HITL gates
- [ ] Each pass uses appropriate rubric dimensions for its phase
- [ ] Content below threshold triggers revision loop (max 2 retries)
- [ ] Flow completes end-to-end autonomously
- [ ] Optional HITL can be re-enabled via config flag

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
