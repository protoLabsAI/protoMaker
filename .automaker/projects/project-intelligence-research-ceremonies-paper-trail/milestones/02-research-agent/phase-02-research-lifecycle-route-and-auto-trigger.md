# Phase 2: Research lifecycle route and auto-trigger

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add POST /api/projects/lifecycle/research route that accepts { projectPath, projectSlug } and triggers ResearchAgent. Add handler in ProjectLifecycleService.research() method. Wire project:lifecycle:initiated event listener to auto-trigger research only when project.researchStatus is 'idle' and the project was created with researchOnCreate flag set (passed through initiate payload).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-lifecycle-service.ts`
- [ ] `apps/server/src/routes/projects/lifecycle/research.ts`
- [ ] `apps/server/src/routes/projects/index.ts`

### Verification
- [ ] POST /api/projects/lifecycle/research triggers ResearchAgent and returns { started: true }
- [ ] Route validates projectPath and projectSlug
- [ ] ProjectLifecycleService.research() method exists and delegates to ResearchAgent
- [ ] Auto-trigger on project:lifecycle:initiated only when researchOnCreate=true

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
