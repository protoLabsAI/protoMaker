# Phase 1: Ops Dashboard layout and timer status panel

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create /ops route with OpsView component. Tab layout: Timers, Events, Maintenance, System. Timer panel shows all registered timers with controls. Real-time WebSocket updates.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/routes/ops.tsx`
- [ ] `apps/ui/src/components/views/ops-view/ops-view.tsx`
- [ ] `apps/ui/src/components/views/ops-view/timer-panel.tsx`
- [ ] `apps/ui/src/components/views/ops-view/use-timer-status.ts`

### Verification

- [ ] /ops route renders OpsView
- [ ] Timer panel lists all tasks
- [ ] Pause/resume controls work
- [ ] WebSocket real-time updates
- [ ] Category grouping and filtering
- [ ] Responsive layout

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
