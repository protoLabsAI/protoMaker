# Phase 1: Enrich NewProjectDialog

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update apps/ui/src/components/views/projects-view/components/new-project-dialog.tsx to add: (1) a description textarea between goal and priority fields, (2) a 'Start with research' toggle at the bottom of the form (default off). On submit, call POST /api/projects/lifecycle/initiate with the form data plus researchOnCreate flag. After successful creation, navigate to the new project page. If researchOnCreate=true, show a toast 'Research started — findings will appear in the Research tab'.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects-view/components/new-project-dialog.tsx`
- [ ] `apps/ui/src/components/views/projects-view/hooks/use-project.ts`

### Verification
- [ ] Description textarea present between goal and priority in the form
- [ ] 'Start with research' toggle present, default off
- [ ] Form submits researchOnCreate flag to initiate route
- [ ] Toast shown when research starts
- [ ] Existing title, goal, priority, color fields unchanged

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
