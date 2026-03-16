# Phase 3: Enhance projects features tab with milestone progress

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Improve apps/ui/src/components/views/projects-view/tabs/features-tab.tsx to be a better project-progress-at-a-glance view. Add: (1) Milestone progress bars at the top showing X/Y phases complete per milestone. (2) Overall project completion percentage (done features / total features). (3) A jump-to-board link on each feature row that navigates to /board?featureId=X. Keep the existing epic accordion structure. Data is available via useProjectFeatures hook.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/projects-view/tabs/features-tab.tsx`

### Verification

- [ ] Features tab shows milestone progress bars (X/Y phases complete)
- [ ] Overall project completion % visible at top
- [ ] Each feature row has a jump-to-board link
- [ ] Clicking jump-to-board navigates to board with feature highlighted
- [ ] npm run build passes

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
