# Phase 3: Integrate event feed into dashboard

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add EventFeed and ProjectHealthCard to dashboard-view.tsx. Show them AFTER a project is selected (when the user has projects). Add a new section below the project list: 'Project Activity' with the health card at top and event feed below. Only show when currentProject is set. Add a collapsible toggle so users can hide it. The feed should filter events to the current project's path.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/dashboard-view.tsx`

### Verification
- [ ] Event feed appears on dashboard when project is selected
- [ ] Health card shows above event feed
- [ ] Events filtered to current project
- [ ] Collapsible/expandable
- [ ] Doesn't break existing project picker layout
- [ ] Clean, not overwhelming

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
