# Phase 3: Remove dead feature creation path and unused types

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove ProjectService.createFeaturesFromProject() (~90 lines, only in tests). Remove associated tests. Remove dead types: CreateFeaturesResult, CreateFeaturesFromProjectOptions, DeepResearchResult, CreateProjectFromPRDOptions. Remove standalone loadProject() from project-orchestration-service.ts, update 2 callers to use ProjectService.getProject(). Remove dead formatPRDContent from antagonistic-review-adapter.ts. Remove unused DependencySatisfactionOptions from dependency-resolver. Delete discord reorganize route (all 501 stubs).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-service.ts`
- [ ] `apps/server/tests/unit/services/project-service.test.ts`
- [ ] `libs/types/src/project.ts`
- [ ] `libs/types/src/index.ts`
- [ ] `apps/server/src/services/project-orchestration-service.ts`
- [ ] `apps/server/src/routes/projects/routes/create-features.ts`
- [ ] `apps/server/src/services/project-lifecycle-service.ts`
- [ ] `apps/server/src/services/antagonistic-review-adapter.ts`
- [ ] `libs/dependency-resolver/src/resolver.ts`
- [ ] `apps/server/src/routes/discord/routes/reorganize.ts`

### Verification
- [ ] Dead method and types removed
- [ ] loadProject() replaced with ProjectService.getProject()
- [ ] Discord reorganize route deleted
- [ ] npm run build:packages passes
- [ ] npm run test:all passes

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
