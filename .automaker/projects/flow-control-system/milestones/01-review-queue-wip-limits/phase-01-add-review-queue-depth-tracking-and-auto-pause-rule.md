# Phase 1: Add review queue depth tracking and auto-pause rule

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a ReviewQueueMonitor that tracks PRs in review state. Add `maxPendingReviews` to WorkflowSettings (default: 5). Add a new LeadEngineerRule `reviewQueueSaturated` that fires when review count >= threshold — pauses auto-mode feature pickup (not running agents). Resume when review count drops below threshold. Track metric: review queue depth over time.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/lead-engineer-rules.ts`
- [ ] `apps/server/src/services/lead-engineer-types.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/src/services/feature-scheduler.ts`

### Verification
- [ ] Review queue depth is tracked
- [ ] Auto-mode pauses pickup when review queue >= maxPendingReviews
- [ ] Auto-mode resumes when queue drops below threshold
- [ ] maxPendingReviews configurable in WorkflowSettings
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
