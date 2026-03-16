# Phase 2: Add project badge to feature cards

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In apps/ui/src/components/views/board-view/components/kanban-card/kanban-card.tsx, add a compact project badge when the feature has a projectSlug. Show a shortened project name (abbreviated slug). Style like the existing epic badge — small, colored pill. Use a deterministic color from a palette based on slug hash. Hide the badge when the board is already filtered to that project. Also add project info to the list-view row.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/kanban-card.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/list-view/list-view.tsx`

### Verification

- [ ] Feature cards with projectSlug show a compact project badge
- [ ] Badge is visually distinct but not overwhelming
- [ ] Badge hidden when board is filtered to that project
- [ ] List view shows project info
- [ ] npm run build passes

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
