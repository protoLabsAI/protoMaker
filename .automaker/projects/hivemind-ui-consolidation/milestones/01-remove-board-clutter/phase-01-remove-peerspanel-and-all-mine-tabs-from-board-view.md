# Phase 1: Remove PeersPanel and All/Mine tabs from board view

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In board-view.tsx, remove the PeersPanel component render and its import. Remove the instanceFilteredFeatures useMemo (replace with plain hookFeatures). In peers-panel.tsx, the component can be deleted since it will no longer be rendered anywhere. Do NOT remove instanceFilter from app-store.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/board-view.tsx`
- [ ] `apps/ui/src/components/views/peers-panel.tsx`

### Verification
- [ ] PeersPanel not rendered in board view
- [ ] All/Mine tab buttons gone
- [ ] Board shows all features
- [ ] No TypeScript errors
- [ ] npm run build:packages passes

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
