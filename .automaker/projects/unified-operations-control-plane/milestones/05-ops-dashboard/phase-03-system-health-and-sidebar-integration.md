# Phase 3: System health and sidebar integration

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

System Health panel with memory, CPU, disk, agents, uptime. Compact ops indicator in sidebar with health dot and counts. Navigation to /ops.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/ops-view/system-health-panel.tsx`
- [ ] `apps/ui/src/components/views/ops-view/use-system-health.ts`
- [ ] `apps/ui/src/components/layout/sidebar.tsx`
- [ ] `apps/ui/src/components/layout/ops-status-indicator.tsx`

### Verification

- [ ] System health panel shows all metrics
- [ ] Health dot: green/amber/red
- [ ] Sidebar shows compact indicator
- [ ] Click navigates to /ops
- [ ] Auto-refresh on 30s interval

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
