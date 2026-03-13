# Phase 1: Wire CeremonyService to ProjectArtifactService

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update CeremonyService so that after each ceremony flow completes (standup, retro, project retro), the output is saved via ProjectArtifactService.saveArtifact() as a 'ceremony-report' artifact. Also append a TimelineEntry to the project's ceremony-timeline via ProjectTimelineService. This ensures every ceremony produces a persistent artifact and a timeline record automatically.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-service.ts`

### Verification
- [ ] After standup flow: ceremony-report artifact saved with ceremony type in metadata
- [ ] After milestone retro flow: ceremony-report artifact saved
- [ ] After project retro flow: ceremony-report artifact saved
- [ ] TimelineEntry appended for each ceremony with type, content summary, author=ava
- [ ] Existing ceremony flow behavior unchanged — artifacts are additive

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
