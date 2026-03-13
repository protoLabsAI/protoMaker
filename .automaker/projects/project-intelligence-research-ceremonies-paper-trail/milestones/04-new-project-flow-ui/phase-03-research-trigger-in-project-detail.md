# Phase 3: Research trigger in project detail

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update the Research tab (apps/ui/src/components/views/projects-view/tabs/research-tab.tsx) to show: (1) when researchStatus is 'idle' — empty state with 'Run Research' button that calls POST /api/projects/lifecycle/research; (2) when 'running' — spinner with 'Research in progress...' message; (3) when 'complete' — renders project.researchSummary as Markdown, lists sources from the research-report artifact if available; (4) when 'failed' — error state with retry button. Add useResearchTrigger hook to use-project.ts that calls the research route and invalidates project query on completion.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects-view/tabs/research-tab.tsx`
- [ ] `apps/ui/src/components/views/projects-view/hooks/use-project.ts`

### Verification
- [ ] All four researchStatus states render correctly
- [ ] Run Research button triggers POST /api/projects/lifecycle/research
- [ ] Running state shows spinner
- [ ] Complete state renders researchSummary markdown and sources list
- [ ] Failed state shows error with retry
- [ ] Project query invalidated after research triggers (forces re-fetch)

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
