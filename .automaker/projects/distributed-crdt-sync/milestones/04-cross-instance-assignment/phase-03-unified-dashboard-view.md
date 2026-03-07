# Phase 3: Unified Dashboard View

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

UI aggregates board state across all connected instances. Shows which instance owns each feature, peer status (online/offline/draining), capacity metrics per instance, and cross-instance assignment history. Leverages existing board view with instance badges and a new peers panel.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/board/board-view.tsx`
- [ ] `apps/ui/src/components/views/peers-panel.tsx`
- [ ] `apps/ui/src/store/app-store.ts`
- [ ] `apps/server/src/routes/hivemind/index.ts`

### Verification
- [ ] Board view shows instance badge on each feature card
- [ ] Peers panel shows all connected instances with status and capacity
- [ ] Features from all instances visible in unified board
- [ ] Filter by instance (show only my features, show all)
- [ ] Cross-instance assignment visible in feature detail view

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
