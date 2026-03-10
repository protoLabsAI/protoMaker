# Phase 1: Add portfolio gate to signal intake

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In SignalIntakeService, after intent classification but before feature creation: evaluate the idea against criteria: (1) Is there capacity? (backlog size < threshold), (2) Does it duplicate existing work? (title similarity check against board), (3) Is complexity appropriate for current error budget? (architectural features blocked when error budget low). Add `portfolioGate: boolean` to WorkflowSettings (default: false — opt-in). When gate rejects: create the feature but mark as `blocked` with reason. When gate defers: add to a `deferred` queue for batch review.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/signal-intake-service.ts`
- [ ] `libs/types/src/global-settings.ts`

### Verification
- [ ] Portfolio gate evaluates ideas before feature creation
- [ ] Capacity, duplication, and budget checks implemented
- [ ] Gate is opt-in via WorkflowSettings
- [ ] Rejected ideas are blocked with clear reason
- [ ] npm run build:server passes
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
