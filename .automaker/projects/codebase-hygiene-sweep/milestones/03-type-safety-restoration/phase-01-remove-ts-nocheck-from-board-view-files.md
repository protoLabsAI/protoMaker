# Phase 1: Remove @ts-nocheck from board view files

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove // @ts-nocheck from 16 board-view files. Fix resulting TypeScript errors with proper type annotations/guards. The Feature type no longer has [key: string]: unknown so most should compile cleanly.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/board-view.tsx`
- [ ] `apps/ui/src/components/views/board-view/hooks/use-board-actions.ts`
- [ ] `apps/ui/src/components/views/board-view/hooks/use-board-column-features.ts`
- [ ] `apps/ui/src/components/views/board-view/dialogs/add-feature-dialog.tsx`
- [ ] `apps/ui/src/components/views/board-view/dialogs/edit-feature-dialog.tsx`
- [ ] `apps/ui/src/components/views/board-view/dialogs/completed-features-modal.tsx`
- [ ] `apps/ui/src/components/views/board-view/dialogs/dependency-tree-dialog.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/kanban-card.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/card-header.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/card-badges.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/card-actions.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/card-content-sections.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/summary-dialog.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/kanban-card/agent-suggestion.tsx`
- [ ] `apps/ui/src/components/views/board-view/components/list-view/list-row.tsx`
- [ ] `apps/ui/src/components/views/board-view/shared/model-selector.tsx`

### Verification
- [ ] Zero @ts-nocheck in board-view files
- [ ] No @ts-ignore workarounds added
- [ ] npm run typecheck passes

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
