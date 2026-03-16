# Phase 2: Event flow and maintenance panels

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Event Flow panel showing webhook deliveries, signal activity, routing. Maintenance panel showing sweep results, issues, auto-fixes. Both with WebSocket updates.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/ops-view/event-flow-panel.tsx`
- [ ] `apps/ui/src/components/views/ops-view/use-event-flow.ts`
- [ ] `apps/ui/src/components/views/ops-view/maintenance-panel.tsx`
- [ ] `apps/ui/src/components/views/ops-view/use-maintenance-status.ts`

### Verification

- [ ] Event flow panel shows deliveries with status
- [ ] Classification details displayed
- [ ] Maintenance panel shows sweep results
- [ ] Auto-fix counts per check
- [ ] WebSocket real-time updates
- [ ] Empty states handled

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
