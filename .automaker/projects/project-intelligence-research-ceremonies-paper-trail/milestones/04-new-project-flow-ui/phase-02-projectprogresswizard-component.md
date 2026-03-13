# Phase 2: ProjectProgressWizard component

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create apps/ui/src/components/views/projects-view/components/project-progress-wizard.tsx. Renders a status-aware banner at the top of the project detail page showing: the current status, what was just completed, and a single primary CTA for the next step. Status → CTA mapping: researching → 'Research running...' (spinner, no action); drafting/reviewing → 'Write PRD' or 'Review PRD' button linking to PRD tab; approved → 'Launch Project' button (calls launch mutation); active → shows feature progress bar; completed → 'View Retrospective' link. The component only renders when project status is not 'ongoing' or 'cancelled'. Integrate into project-detail.tsx above the tabs.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects-view/components/project-progress-wizard.tsx`
- [ ] `apps/ui/src/components/views/projects-view/project-detail.tsx`

### Verification
- [ ] Banner renders for all lifecycle statuses except ongoing and cancelled
- [ ] Each status shows appropriate label and CTA
- [ ] researching status shows spinner and no clickable action
- [ ] approved status Launch button calls launch mutation
- [ ] Component integrated into project-detail.tsx above tabs
- [ ] Does not render for ongoing/cancelled projects

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
