# Phase 1: Migrate PRFeedbackService and ArchivalService timers

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Migrate PRFeedbackService (60s poll at pr-feedback-service.ts:212) and ArchivalService (10min at archival-service.ts:55) from raw setInterval to schedulerService.registerInterval(). Both are long-lived system timers that should be visible in Ops Dashboard. Replace the setInterval call with registerInterval, store the cleanup function, and call it on destroy/stop. Preserve existing behavior exactly.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`
- [ ] `apps/server/src/services/archival-service.ts`

### Verification
- [ ] PRFeedbackService timer visible in Ops Dashboard at /api/ops/timers
- [ ] ArchivalService timer visible in Ops Dashboard
- [ ] Both timers pause/resume correctly via scheduler
- [ ] Existing polling behavior unchanged
- [ ] No raw setInterval remains in either file
- [ ] Server tests pass

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
