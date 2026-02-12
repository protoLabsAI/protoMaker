# Phase 1: Ceremony types and event extensions

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create ceremony types (CeremonyType, MilestoneUpdateData, ProjectRetroData) in libs/types/src/ceremony.ts. Add 'milestone_completed' and 'project_completed' to EventHookTrigger in settings.ts. Add 'ceremony:milestone-update' and 'ceremony:project-retro' to EventType in event.ts. Export from libs/types/src/index.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/ceremony.ts`
- [ ] `libs/types/src/settings.ts`
- [ ] `libs/types/src/event.ts`
- [ ] `libs/types/src/index.ts`

### Verification
- [ ] CeremonyType, MilestoneUpdateData, ProjectRetroData types exist
- [ ] EventHookTrigger includes milestone_completed and project_completed
- [ ] EventType includes ceremony:milestone-update and ceremony:project-retro
- [ ] npm run build:packages succeeds with zero errors

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
