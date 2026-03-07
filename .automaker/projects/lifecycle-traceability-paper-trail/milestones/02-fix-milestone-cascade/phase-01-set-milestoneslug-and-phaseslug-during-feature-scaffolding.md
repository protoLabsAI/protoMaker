# Phase 1: Set milestoneSlug and phaseSlug during feature scaffolding

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update orchestrateProjectFeatures() in project-orchestration-service.ts to pass milestoneSlug: milestone.slug and phaseSlug: phase.slug when calling featureLoader.create() for each phase feature. Also set milestoneSlug on epic features created for milestones. Do the same in ProjectService.createFeaturesFromProject() in project-service.ts. Add phaseSlug as an optional field to the Feature type in libs/types/src/feature.ts if not already present. Run the M1 scaffolding tests — they should now PASS.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-orchestration-service.ts`
- [ ] `apps/server/src/services/project-service.ts`
- [ ] `libs/types/src/feature.ts`

### Verification
- [ ] orchestrateProjectFeatures passes milestoneSlug to featureLoader.create for phase features
- [ ] orchestrateProjectFeatures passes milestoneSlug to featureLoader.create for epic features
- [ ] ProjectService.createFeaturesFromProject passes milestoneSlug for phase features
- [ ] phaseSlug optional field added to Feature type
- [ ] Both creation paths set phaseSlug from phase.slug
- [ ] M1 scaffolding tests now pass
- [ ] npm run typecheck passes
- [ ] npm run build:packages passes

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
