# Phase 1: Fix ceremony payloads with remainingMilestones and retroData

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Two connected gaps prevent the ceremony pipeline from completing:

H2: ceremony-service.ts emits milestone retro events (lines 750-755) without remainingMilestones in the payload. The state machine (ceremony-state-machine.ts:27-34) defaults to remainingMilestones 1 when missing, so it always loops back to milestone_active instead of advancing to project_retro.

H3: ceremony-service.ts emits ceremony:fired events without retroData. CeremonyActionExecutor (ceremony-action-executor.ts:266-268) checks for retroData and exits immediately if missing, skipping all retro processing.

Fix: In ceremony-service.ts milestone retro emission, calculate remaining milestones from the project milestone list and include remainingMilestones count. In retro emissions, generate and include retroData with retro analysis results. Verify state machine transitions and action executor proceeds.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/src/services/ceremony-state-machine.ts`
- [ ] `apps/server/src/services/ceremony-action-executor.ts`

### Verification

- [ ] ceremony:fired milestone_retro events include remainingMilestones count
- [ ] ceremony:fired events include retroData with retro analysis
- [ ] Ceremony state machine transitions to project_retro when remainingMilestones is 0
- [ ] CeremonyActionExecutor.handleRetroCompleted() processes retroData
- [ ] npm run typecheck passes
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
