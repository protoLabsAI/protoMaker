# Phase 1: ProjectListCard and ProjectDetailCard

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create ProjectListCard for list_projects — renders projects as compact rows with title, status badge, milestone progress (e.g. 2/5 milestones done), and goal preview. Create ProjectDetailCard for get_project — renders full project info: title, goal, status, PRD summary, milestone breakdown with phase counts and completion percentages. Register both.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/ui/src/ai/tool-results/project-list-card.tsx`
- [ ] `libs/ui/src/ai/tool-results/project-detail-card.tsx`
- [ ] `libs/ui/src/ai/tool-invocation-part.tsx`

### Verification

- [ ] ProjectListCard renders project rows with title, status, milestone progress
- [ ] ProjectDetailCard renders full project with milestone breakdown
- [ ] Both handle empty/missing data
- [ ] Both registered in tool-invocation-part.tsx
- [ ] Build passes

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
