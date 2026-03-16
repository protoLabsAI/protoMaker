# Phase 1: Add project filter dropdown to board header

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In apps/ui/src/components/views/board-view/board-header.tsx, add a project filter dropdown listing all projects. When selected, filter the board to only show features with that projectSlug (All Projects = no filter). Add selectedProjectSlug filter state to board-view.tsx and pass it to use-board-column-features.ts for filtering. Use existing project query hook or create a minimal useProjects hook if needed. The dropdown should show project title. No new backend routes needed.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/board-view/board-header.tsx`
- [ ] `apps/ui/src/components/views/board-view/hooks/use-board-column-features.ts`
- [ ] `apps/ui/src/components/views/board-view/board-view.tsx`

### Verification

- [ ] Board header shows project filter dropdown
- [ ] Selecting a project filters features to only that project
- [ ] All Projects option shows everything
- [ ] Dropdown is visually consistent with existing board header controls
- [ ] npm run build passes

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
