# Phase 3: Job conflict detection and calendar UI updates

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add conflict detection for overlapping job events (advisory, not blocking). Update calendar UI: recurring event indicators, timezone display, ops timeline entries, conflict warnings, mini-timeline sidebar.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/calendar-service.ts`
- [ ] `apps/ui/src/components/views/calendar-view/calendar-view.tsx`
- [ ] `apps/ui/src/components/views/calendar-view/use-calendar-events.ts`
- [ ] `apps/ui/src/components/views/calendar-view/event-detail-panel.tsx`
- [ ] `apps/ui/src/components/views/calendar-view/create-event-dialog.tsx`

### Verification

- [ ] Conflict detection checks for overlapping jobs
- [ ] Calendar UI shows recurring event indicators
- [ ] Ops events displayed with distinct styling
- [ ] Event detail shows recurrence and timezone
- [ ] Create dialog supports recurrence
- [ ] Conflict warnings on overlapping jobs

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
