# Phase 1: Remove dead PRDService and LangGraph planning flow

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete prd-service.ts (277 lines, instantiated but never used). Delete project-planning-service.ts (480 lines, listens for event never emitted). Delete project-planning-executors.ts. Delete entire libs/flows/src/project-planning/ directory. Delete libs/flows/src/project-management/ empty stub. Remove initializations from server/services.ts. Remove exports from package indexes. Delete generate-prd.ts stub route.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/prd-service.ts`
- [ ] `apps/server/src/services/project-planning-service.ts`
- [ ] `apps/server/src/services/project-planning-executors.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/routes/projects/lifecycle/generate-prd.ts`
- [ ] `libs/flows/src/project-planning/`
- [ ] `libs/flows/src/project-management/`
- [ ] `libs/flows/src/index.ts`

### Verification
- [ ] All listed files/directories deleted
- [ ] No remaining imports of deleted items
- [ ] npm run build:packages passes
- [ ] npm run build:server passes
- [ ] npm run test:all passes

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
