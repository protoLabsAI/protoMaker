# Phase 2: Artifacts tab polish — ceremony reports, standups, retros

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update apps/ui/src/components/views/projects/project-artifact-viewer.tsx to: (1) show ceremony-report artifacts grouped by type (Standup, Milestone Retro, Project Retro) with distinct icons; (2) add expandable markdown content rendering inside each artifact card (replace plain text preview); (3) add a Download as Markdown button per artifact that triggers a file download; (4) sort artifacts by date descending with a type filter dropdown at the top.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects/project-artifact-viewer.tsx`

### Verification
- [ ] Ceremony reports grouped by Standup / Milestone Retro / Project Retro
- [ ] Each artifact has distinct icon matching its type
- [ ] Expandable card renders artifact content as Markdown
- [ ] Download as Markdown button triggers browser file download
- [ ] Type filter dropdown at top filters to selected artifact type
- [ ] Default sort is date descending

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
